#!/usr/bin/env node

import { writeFileSync } from 'fs';
import { join } from 'path';

interface Module {
  name: string;
  provider: string;
  namespace: string;
  version: string;
}

interface ModuleVersion {
  version: string;
  published_at: string;
}

interface ModuleVersionsResponse {
  modules: Array<{
    versions: ModuleVersion[];
  }>;
}

interface MajorRelease {
  module_name: string;
  provider: string;
  major_version: number;
  first_release_version: string;
  release_date: string;
  releases_count: number;
}

const NAMESPACE = 'pagopa-dx';
const TERRAFORM_REGISTRY_API = 'https://registry.terraform.io/v1';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';

/**
 * Parse semantic version and extract major version number
 */
function parseMajorVersion(version: string): number | null {
  const match = version.match(/^v?(\d+)\./);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Fetch all modules from the pagopa-dx namespace
 */
async function fetchNamespaceModules(): Promise<Module[]> {
  const url = `${TERRAFORM_REGISTRY_API}/modules/${NAMESPACE}`;
  console.error(`Fetching modules from namespace: ${NAMESPACE}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as { modules: Module[] };
    console.error(`Found ${data.modules?.length || 0} modules`);
    return data.modules || [];
  } catch (error) {
    console.error(`Error fetching namespace modules:`, error);
    return [];
  }
}

/**
 * Fetch all versions for a specific module
 */
async function fetchModuleVersions(
  namespace: string,
  name: string,
  provider: string
): Promise<ModuleVersion[]> {
  const url = `${TERRAFORM_REGISTRY_API}/modules/${namespace}/${name}/${provider}/versions`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as ModuleVersionsResponse;
    return data.modules?.[0]?.versions || [];
  } catch (error) {
    console.error(`Error fetching versions for ${namespace}/${name}/${provider}:`, error);
    return [];
  }
}

/**
 * Identify major releases from version history
 */
function identifyMajorReleases(
  moduleName: string,
  provider: string,
  versions: ModuleVersion[]
): MajorRelease[] {
  // Sort versions by date (oldest first)
  const sortedVersions = [...versions].sort(
    (a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
  );

  const majorReleases: MajorRelease[] = [];
  const seenMajorVersions = new Set<number>();

  for (const version of sortedVersions) {
    const majorVersion = parseMajorVersion(version.version);
    
    if (majorVersion !== null && !seenMajorVersions.has(majorVersion)) {
      seenMajorVersions.add(majorVersion);
      
      // Count how many versions exist for this major version
      const majorVersionCount = sortedVersions.filter(
        v => parseMajorVersion(v.version) === majorVersion
      ).length;

      majorReleases.push({
        module_name: moduleName,
        provider: provider,
        major_version: majorVersion,
        first_release_version: version.version,
        release_date: version.published_at,
        releases_count: majorVersionCount,
      });
    }
  }

  return majorReleases;
}

/**
 * Generate CSV from major releases data
 */
function generateCSV(releases: MajorRelease[]): string {
  const headers = [
    'module_name',
    'provider',
    'major_version',
    'first_release_version',
    'release_date',
    'releases_count',
    'release_year',
    'release_month',
  ];

  const rows = releases.map(release => {
    const date = new Date(release.release_date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    return [
      release.module_name,
      release.provider,
      release.major_version,
      release.first_release_version,
      release.release_date,
      release.releases_count,
      year,
      `${year}-${month}`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Main execution
 */
async function main() {
  console.error('=== Terraform Registry Major Releases Report ===');
  console.error(`Namespace: ${NAMESPACE}`);
  console.error(`Output directory: ${OUTPUT_DIR}\n`);

  // Fetch all modules in the namespace
  const modules = await fetchNamespaceModules();
  
  if (modules.length === 0) {
    console.error('No modules found. Exiting.');
    process.exit(1);
  }

  const allMajorReleases: MajorRelease[] = [];

  // Process each module
  for (const module of modules) {
    const fullModuleName = `${module.namespace}/${module.name}/${module.provider}`;
    console.error(`\nProcessing: ${fullModuleName}`);
    
    const versions = await fetchModuleVersions(
      module.namespace,
      module.name,
      module.provider
    );
    
    console.error(`  Found ${versions.length} versions`);
    
    if (versions.length > 0) {
      const majorReleases = identifyMajorReleases(
        module.name,
        module.provider,
        versions
      );
      
      console.error(`  Identified ${majorReleases.length} major releases`);
      allMajorReleases.push(...majorReleases);
    }
    
    // Be nice to the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Sort by release date (newest first)
  allMajorReleases.sort(
    (a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
  );

  // Generate CSV
  const csv = generateCSV(allMajorReleases);
  const outputPath = join(OUTPUT_DIR, 'terraform_registry_major_releases.csv');
  
  writeFileSync(outputPath, csv, 'utf-8');
  console.error(`\n✓ Report generated: ${outputPath}`);
  console.error(`✓ Total major releases tracked: ${allMajorReleases.length}`);
  
  // Print summary statistics
  const moduleStats = new Map<string, number>();
  for (const release of allMajorReleases) {
    const key = `${release.module_name}/${release.provider}`;
    moduleStats.set(key, (moduleStats.get(key) || 0) + 1);
  }
  
  console.error('\n=== Summary by Module ===');
  for (const [module, count] of Array.from(moduleStats.entries()).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${module}: ${count} major releases`);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
