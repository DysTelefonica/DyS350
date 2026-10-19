// @ts-nocheck
import * as React from "react";
import { sp } from "@pnp/sp";
import styles from "./MyTasks.module.scss";
import type { IMyTasksProps } from "./IMyTasksProps";
import TaskList from "../../../ui/taskList/TaskList";
import Loading from "../../../ui/loading/Loading";

/** Comparación sin tildes, sin mayúsculas y con espacios normalizados. */
const normalizeForMatch = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    // @ts-ignore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const isUserOnTask = (
  responsable: unknown,
  elaborador: unknown,
  userNorm: string,
): boolean => {
  if (!userNorm) return false;
  if (normalizeForMatch(responsable) === userNorm) return true;
  const elaboradorNorm = normalizeForMatch(elaborador);
  if (!elaboradorNorm) return false;
  if (elaboradorNorm.indexOf(userNorm) >= 0) return true;
  return elaboradorNorm
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => part === userNorm || part.indexOf(userNorm) >= 0);
};

const MyTasks: React.FC<IMyTasksProps> = ({
  context,
  userDisplayName,
  userEmail,
  hasTeamsContext,
  itemsPerPage,
}) => {
  const [projectIds, setProjectIds] = React.useState<number[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  React.useEffect(() => {
    const loadUserTaskIds = async () => {
      try {
        setIsLoading(true);
        setError("");

        const userNorm = normalizeForMatch(userDisplayName);
        if (!userNorm) {
          setProjectIds([]);
          return;
        }

        const tareasRaw: any[] = await sp.web.lists
          .getByTitle("TareasDocumentales")
          .items.select("IDTarea", "IDProyecto", "Responsable", "Elaborador")
          .top(5000)
          .getAll();

        const revisionesRaw: any[] = await sp.web.lists
          .getByTitle("Revisiones")
          .items.select("IDTareaDocumental", "Title")
          .top(5000)
          .getAll();

        const firmasRaw: any[] = await sp.web.lists
          .getByTitle("Firmas")
          .items.select("IDTareaDocumental", "Title")
          .top(5000)
          .getAll();

        const taskIdsMap: Record<number, boolean> = {};
        const relatedTaskIds: number[] = [];
        const addTaskId = (value: unknown): void => {
          const id = Number(value);
          if (!isFinite(id) || id <= 0 || taskIdsMap[id]) return;
          taskIdsMap[id] = true;
          relatedTaskIds.push(id);
        };

        tareasRaw.forEach((row) => {
          if (isUserOnTask(row?.Responsable, row?.Elaborador, userNorm)) {
            addTaskId(row?.IDTarea);
          }
        });
        revisionesRaw.forEach((r) => {
          if (normalizeForMatch(r?.Title) === userNorm) {
            addTaskId(r?.IDTareaDocumental);
          }
        });
        firmasRaw.forEach((f) => {
          if (normalizeForMatch(f?.Title) === userNorm) {
            addTaskId(f?.IDTareaDocumental);
          }
        });

        if (relatedTaskIds.length === 0) {
          setProjectIds([]);
          return;
        }

        const includedTaskMap: Record<number, boolean> = {};
        relatedTaskIds.forEach((id) => {
          includedTaskMap[id] = true;
        });
        const projectMap: Record<number, boolean> = {};
        const projects: number[] = [];
        tareasRaw.forEach((row) => {
          const taskId = Number(row?.IDTarea);
          if (!includedTaskMap[taskId]) return;
          const projectId = Number(row?.IDProyecto);
          if (!isFinite(projectId) || projectId <= 0 || projectMap[projectId])
            return;
          projectMap[projectId] = true;
          projects.push(projectId);
        });

        setProjectIds(projects);
      } catch (e) {
        console.error("Error cargando tareas del usuario:", e);
        setProjectIds([]);
        setError("No se pudieron resolver tus tareas.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadUserTaskIds();
  }, [userDisplayName]);

  return (
    <section
      className={`${styles.myTasks} ${hasTeamsContext ? styles.teams : ""}`}
    >
      {isLoading ? (
        <Loading message="Estamos cargando tus tareas de todos los expedientes..." />
      ) : error ? (
        <div>{error}</div>
      ) : projectIds.length === 0 ? (
        <div>No hay tareas asociadas a tu usuario.</div>
      ) : (
        <TaskList
          context={context}
          projectId={null}
          projectIds={projectIds}
          itemsPerPage={itemsPerPage}
          listTitle="Mis tareas"
          myTasksUserName={userDisplayName}
          displayTitle={false}
        />
      )}
    </section>
  );
};

export default MyTasks;
