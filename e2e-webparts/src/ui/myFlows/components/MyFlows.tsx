// @ts-nocheck
import * as React from "react";
import { sp } from "@pnp/sp";
import styles from "./MyFlows.module.scss";
import type { IMyFlowsProps } from "./IMyFlowsProps";
import TaskList from "../../taskList/TaskList";

const normalizeText = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const MyFlows: React.FC<IMyFlowsProps> = ({
  context,
  hasTeamsContext = false,
  itemsPerPage = 10,
}) => {
  const [projectIds, setProjectIds] = React.useState<number[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string>("");
  const userName = String(context.pageContext.user.displayName || "").trim();
  const userEmail = String(context.pageContext.user.email || "").trim();

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  React.useEffect(() => {
    const loadFlowProjects = async () => {
      try {
        setIsLoading(true);
        setError("");
        const userNameNorm = normalizeText(userName);
        const userEmailNorm = normalizeText(userEmail);
        if (!userNameNorm && !userEmailNorm) {
          setProjectIds([]);
          return;
        }

        const revisionesPend: Array<{
          IDTareaDocumental?: number | string;
          Title?: string;
          IDRevisor?: string;
        }> = await sp.web.lists
          .getByTitle("Revisiones")
          .items.filter(`EstadoRevision eq 'Pendiente'`)
          .select("IDTareaDocumental", "Title", "IDRevisor")
          .top(5000)
          .getAll();

        const flowTaskSet: Record<number, boolean> = {};
        revisionesPend.forEach((rev) => {
          const taskId = Number(rev.IDTareaDocumental);
          if (!isFinite(taskId) || taskId <= 0) return;
          const byTitle = normalizeText(String(rev.Title || "")) === userNameNorm;
          const byEmail =
            !!userEmailNorm &&
            normalizeText(String(rev.IDRevisor || "")) === userEmailNorm;
          if (byTitle || byEmail) {
            flowTaskSet[taskId] = true;
          }
        });

        const firmasPend: Array<{
          IDTareaDocumental?: number | string;
          Title?: string;
          IDFirmante?: string;
        }> = await sp.web.lists
          .getByTitle("Firmas")
          .items.filter(`EstadoFirma eq 'Pendiente'`)
          .select("IDTareaDocumental", "Title", "IDFirmante")
          .top(5000)
          .getAll();

        firmasPend.forEach((firma) => {
          const taskId = Number(firma.IDTareaDocumental);
          if (!isFinite(taskId) || taskId <= 0) return;
          const byTitle = normalizeText(firma.Title) === userNameNorm;
          const byEmail =
            !!userEmailNorm && normalizeText(firma.IDFirmante) === userEmailNorm;
          if (byTitle || byEmail) {
            flowTaskSet[taskId] = true;
          }
        });

        const flowTaskIds = Object.keys(flowTaskSet)
          .map((id) => Number(id))
          .filter((id) => isFinite(id) && id > 0);
        if (flowTaskIds.length === 0) {
          setProjectIds([]);
          return;
        }

        const tareasFilter = flowTaskIds.map((id) => `IDTarea eq ${id}`).join(" or ");
        const tareasRaw: any[] = await sp.web.lists
          .getByTitle("TareasDocumentales")
          .items.filter(
            `(${tareasFilter}) and (EstadoTarea eq 'EnRevision' or EstadoTarea eq 'EnFirma')`,
          )
          .select("IDProyecto")
          .top(5000)
          .getAll();

        const projectMap: Record<number, boolean> = {};
        const ids: number[] = [];
        tareasRaw.forEach((t) => {
          const projectId = Number(t?.IDProyecto);
          if (!isFinite(projectId) || projectId <= 0 || projectMap[projectId]) {
            return;
          }
          projectMap[projectId] = true;
          ids.push(projectId);
        });
        setProjectIds(ids);
      } catch (e) {
        console.error("Error cargando flujos pendientes del usuario:", e);
        setError("No se pudieron cargar tus flujos pendientes.");
        setProjectIds([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadFlowProjects();
  }, [userName, userEmail]);

  return (
    <section className={`${styles.myFlows} ${hasTeamsContext ? styles.teams : ""}`}>
      {isLoading ? (
        <div className={styles.emptyState}>Cargando flujos pendientes...</div>
      ) : error ? (
        <div className={styles.emptyState}>{error}</div>
      ) : projectIds.length === 0 ? (
        <div className={styles.emptyState}>
          No tienes tareas pendientes de revisión o firma en este momento.
        </div>
      ) : (
        <TaskList
          context={context}
          projectId={null}
          projectIds={projectIds}
          itemsPerPage={itemsPerPage}
          listTitle="Mis flujos pendientes"
          forcedEstados={["EnRevision", "EnFirma"]}
          showFlowColumns={true}
          myFlowsUserName={userName}
          displayTitle={false}
        />
      )}
    </section>
  );
};

export default MyFlows;
