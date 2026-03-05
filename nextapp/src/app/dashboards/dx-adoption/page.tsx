"use client";

import { useState } from "react";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SimplePieChart, DataTable } from "@/components/Charts";
import { useDashboardData } from "@/lib/useDashboardData";

interface DxAdoptionData {
  pipelineAdoption: { pipeline_type: string; pipeline_count: number }[];
  moduleAdoption: { module_type: string; module_count: number }[];
  workflowsList: { workflow_name: string; pipeline_type: string }[];
  modulesList: {
    module_name: string;
    module_type: string;
    file_path: string;
  }[];
}

export default function DxAdoptionDashboard() {
  const [repository, setRepository] = useState("dx");

  const { data, loading } = useDashboardData<DxAdoptionData>("dx-adoption", {
    repository,
  });

  const pipelinePie =
    data?.pipelineAdoption.map((r) => ({
      name: r.pipeline_type,
      value: Number(r.pipeline_count),
    })) || [];

  const modulePie =
    data?.moduleAdoption.map((r) => ({
      name: r.module_type,
      value: Number(r.module_count),
    })) || [];

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">
        DX Tools Adoption Metrics
      </h2>
      <DashboardFilters
        repository={repository}
        onRepositoryChange={setRepository}
        showTimeInterval={false}
      />

      {loading && <p className="text-gray-500">Loading...</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <SimplePieChart title="DX Pipeline Adoption" data={pipelinePie} />
            <SimplePieChart
              title="DX Terraform Modules Adoption"
              data={modulePie}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <DataTable
              title="Workflows List"
              columns={[
                { key: "workflow_name", label: "Workflow" },
                { key: "pipeline_type", label: "Type" },
              ]}
              data={data.workflowsList}
            />
            <DataTable
              title="Terraform Modules List"
              columns={[
                { key: "module_name", label: "Module" },
                { key: "module_type", label: "Type" },
                { key: "file_path", label: "File Path" },
              ]}
              data={data.modulesList}
            />
          </div>
        </>
      )}
    </div>
  );
}
