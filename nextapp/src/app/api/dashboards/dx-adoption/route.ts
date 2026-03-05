import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const repository = searchParams.get("repository") || "dx";
  const org = process.env.ORGANIZATION || "pagopa";
  const fullName = `${org}/${repository}`;

  try {
    // DX Pipeline Adoption (pie)
    const pipelineAdoption = await db.execute(sql`
      WITH distinct_workflows AS (
        SELECT DISTINCT ON (w.name) w.name, w.pipeline
        FROM workflows w JOIN repositories r ON w.repository_id = r.id
        WHERE r.full_name = ${fullName} AND w.name NOT IN ('CodeQL', 'Labeler')
      )
      SELECT CASE WHEN pipeline LIKE '%pagopa/dx%' THEN 'DX Pipelines' ELSE 'Non-DX Pipelines' END AS pipeline_type,
        COUNT(*) AS pipeline_count
      FROM distinct_workflows
      GROUP BY CASE WHEN pipeline LIKE '%pagopa/dx%' THEN 'DX Pipelines' ELSE 'Non-DX Pipelines' END
      ORDER BY pipeline_type
    `);

    // DX Terraform Modules Adoption (pie)
    const moduleAdoption = await db.execute(sql`
      WITH distinct_modules AS (
        SELECT DISTINCT ON (module) module
        FROM terraform_modules
        WHERE repository = ${fullName}
          AND module NOT LIKE './%' AND module NOT LIKE '../%'
      )
      SELECT CASE WHEN module LIKE '%pagopa-dx%' OR module LIKE '%pagopa/dx%'
        THEN 'DX Terraform Modules' ELSE 'Non-DX Terraform Modules' END AS module_type,
        COUNT(*) AS module_count
      FROM distinct_modules
      GROUP BY CASE WHEN module LIKE '%pagopa-dx%' OR module LIKE '%pagopa/dx%'
        THEN 'DX Terraform Modules' ELSE 'Non-DX Terraform Modules' END
      ORDER BY module_type
    `);

    // Workflows List
    const workflowsList = await db.execute(sql`
      SELECT DISTINCT ON (w.name) w.name AS workflow_name,
        CASE WHEN w.pipeline LIKE '%pagopa/dx%' THEN '✓ DX' ELSE 'Non-DX' END AS pipeline_type
      FROM workflows w JOIN repositories r ON w.repository_id = r.id
      WHERE r.full_name = ${fullName} AND w.name NOT IN ('CodeQL', 'Labeler')
      ORDER BY w.name, CASE WHEN w.pipeline LIKE '%pagopa/dx%' THEN 0 ELSE 1 END
    `);

    // Terraform Modules List
    const modulesList = await db.execute(sql`
      SELECT DISTINCT ON (module) module AS module_name,
        CASE WHEN module LIKE '%pagopa-dx%' OR module LIKE '%pagopa/dx%' THEN '✓ DX' ELSE 'Non-DX' END AS module_type,
        file_path
      FROM terraform_modules
      WHERE repository = ${fullName}
        AND module NOT LIKE './%' AND module NOT LIKE '../%'
      ORDER BY module, CASE WHEN module LIKE '%pagopa-dx%' OR module LIKE '%pagopa/dx%' THEN 0 ELSE 1 END
    `);

    return NextResponse.json({
      pipelineAdoption: pipelineAdoption.rows,
      moduleAdoption: moduleAdoption.rows,
      workflowsList: workflowsList.rows,
      modulesList: modulesList.rows,
    });
  } catch (error) {
    console.error("DX Adoption dashboard error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
