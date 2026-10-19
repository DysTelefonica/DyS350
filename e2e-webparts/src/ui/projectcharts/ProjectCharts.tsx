import * as React from "react";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import styles from "./ProjectCharts.module.scss";
import { groupByCount } from "../../utils/utils";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
);

interface Props {
  projects: any[];
}

const buildChartData = (data: Record<string, number>) => ({
  labels: Object.keys(data),
  datasets: [
    {
      label: "Expedientes",
      //   @ts-ignore
      data: Object.values(data),
      backgroundColor: ["#2563eb", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444"],
    },
  ],
});

// Para campos de tipo texto multivalor separados por ';' (como Juridicas)
const explodeMultiValueField = (items: any[], key: string): any[] => {
  const result: any[] = [];
  items.forEach((item) => {
    const raw = item[key];
    if (!raw) {
      return;
    }
    const parts = String(raw)
      .split(";")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (!parts.length) {
      return;
    }

    parts.forEach((value) => {
      result.push({
        ...item,
        [key]: value,
      });
    });
  });
  return result;
};

const normalizePecalLabel = (value: unknown): string => {
  if (typeof value === "boolean") return value ? "Pecal" : "Sin pecal";
  if (typeof value === "number") return value === 1 ? "Pecal" : "Sin pecal";
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "true" || raw === "1" || raw === "si" || raw === "sí") {
    return "Pecal";
  }
  if (!raw || raw === "false" || raw === "0" || raw === "no") {
    return "Sin pecal";
  }
  return String(value || "");
};

const ProjectCharts: React.FC<Props> = ({ projects }) => {
  // Usamos directamente los nombres de columna de la lista Expedientes
  // Filtramos valores nulos/vacíos para el gráfico de Estado
  const proyectosConEstado = projects.filter(
    (p) => p.Estado && String(p.Estado).trim().length > 0,
  );
  const estado = buildChartData(groupByCount(proyectosConEstado, "Estado"));
  // Juridicas puede venir con varios valores separados por ';', los expandimos
  const juridica = buildChartData(
    groupByCount(explodeMultiValueField(projects, "Juridicas"), "Juridicas"),
  );
  const pecal = buildChartData(
    groupByCount(
      projects.map((p) => ({
        ...p,
        CadenaPecal: normalizePecalLabel(p.CadenaPecal),
      })),
      "CadenaPecal",
    ),
  );
  const clasificacion = buildChartData(
    groupByCount(projects, "IDGradoClasificacion"),
  );
  const chartHasData = (chart: {
    datasets?: Array<{ data?: Array<number | null | undefined> }>;
  }): boolean => {
    const values = chart?.datasets?.[0]?.data || [];
    return values.some((v) => Number(v || 0) > 0);
  };

  return (
    <div className={styles.chartsGrid}>
      {chartHasData(estado) && (
        <div className={styles.card}>
          <h3>Estado</h3>
          <Pie data={estado} />
        </div>
      )}

      {chartHasData(juridica) && (
        <div className={styles.card}>
          <h3>Jurídicas</h3>
          <Pie data={juridica} />
        </div>
      )}

      {chartHasData(pecal) && (
        <div className={styles.card}>
          <h3>PECAL</h3>
          <Pie data={pecal} />
        </div>
      )}

      {chartHasData(clasificacion) && (
        <div className={styles.card}>
          <h3>Clasificación</h3>
          <Pie data={clasificacion} />
        </div>
      )}
    </div>
  );
};

export default ProjectCharts;
