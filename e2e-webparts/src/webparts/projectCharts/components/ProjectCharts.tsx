import * as React from "react";
import type { IProjectChartsProps } from "./IProjectChartsProps";
import styles from "./ProjectCharts.module.scss";
import ProjectCharts from "../../../ui/projectcharts/ProjectCharts";
import { sp } from "@pnp/sp";

const ProjectChartsWebpart: React.FC<IProjectChartsProps> = ({ context }) => {
  const [projects, setProjects] = React.useState<any[]>([]);

  // Inicializar PnP SP con el contexto de SPFx
  React.useEffect(() => {
    sp.setup({
      spfxContext: context,
    });
  }, [context]);

  // Cargar datos reales desde la lista "Expedientes"
  React.useEffect(() => {
    const loadExpedientes = async () => {
      try {
        const items: any[] = await sp.web.lists
          .getByTitle("Expedientes")
          .items.select(
            "Estado",
            "Juridicas",
            "CadenaPecal",
            "IDGradoClasificacion"
          )
          .top(5000)
          .getAll();

        // Cargar catálogo de jurídicas válidas desde la lista juridicasTelefonica
        const juridicasMasterItems: any[] = await sp.web.lists
          .getByTitle("juridicasTelefonica")
          .items.select("Title")
          .top(5000)
          .get();

        const juridicasValidas = new Set(
          juridicasMasterItems
            .map((it) => (it.Title as string) || "")
            .filter((t) => !!t),
        );

        // Filtrar el campo Juridicas de cada expediente para dejar solo los valores existentes en juridicasTelefonica
        const itemsFiltrados = items.map((it) => {
          const raw = (it.Juridicas as string) || "";
          if (!raw) {
            return it;
          }

          const partesValidas = raw
            .split(";")
            .map((p) => p.trim())
            .filter((p) => p.length > 0 && juridicasValidas.has(p));

          return {
            ...it,
            Juridicas: partesValidas.join(";"),
          };
        });

        setProjects(itemsFiltrados);
      } catch (err) {
        console.error("Error cargando datos para ProjectCharts desde Expedientes:", err);
      }
    };

    void loadExpedientes();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <ProjectCharts projects={projects} />
      </div>
    </div>
  );
};

export default ProjectChartsWebpart;
