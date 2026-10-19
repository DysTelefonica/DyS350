// @ts-nocheck
import * as React from "react";
import { sp } from "@pnp/sp";
import styles from "./Notifications.module.scss";
import type { INotificationsProps } from "./INotificationsProps";
import Loading from "../../../ui/loading/Loading";

const NOTIFICATIONS_COUNT_STORAGE_KEY = "e2e.pendingNotificationsCount";

interface ITaskNotif {
  idTarea: number;
  title: string;
  estado: string;
  responsable: string;
  nemotecnico?: string;
  deadline?: string;
}

const normalize = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase();

const escapeOData = (value: string): string => value.replace(/'/g, "''");

const isFinalState = (estado: string): boolean => normalize(estado) === "fin";

const isUserInElaboradores = (
  elaboradorRaw: unknown,
  userNameNorm: string,
  userEmailNorm?: string,
): boolean => {
  const names = String(elaboradorRaw || "")
    .split(",")
    .map((n) => normalize(n))
    .filter(Boolean);
  if (!names.length) return false;
  if (userNameNorm && names.indexOf(userNameNorm) >= 0) return true;
  if (userEmailNorm && names.indexOf(userEmailNorm) >= 0) return true;
  return false;
};

const Notifications: React.FC<INotificationsProps> = ({
  context,
  hasTeamsContext,
  userDisplayName,
  userEmail,
}) => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string>("");
  const [flowTasks, setFlowTasks] = React.useState<ITaskNotif[]>([]);
  const [deadlineTasks, setDeadlineTasks] = React.useState<ITaskNotif[]>([]);
  const [deliveryTasks, setDeliveryTasks] = React.useState<ITaskNotif[]>([]);

  const absolutePath = context.pageContext.web.absoluteUrl;
  const userNameNorm = normalize(userDisplayName);
  const userEmailNorm = normalize(userEmail);

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  React.useEffect(() => {
    const loadNotifications = async () => {
      try {
        setLoading(true);
        setError("");

        // 1) Resolver IDRol del "Jefe de Proyecto"
        const rolesItems: any[] = await sp.web.lists
          .getByTitle("Roles")
          .items.filter(`Title eq 'Jefe de Proyecto'`)
          .select("IDRol")
          .top(1)
          .get();
        const jefeProyectoRolId =
          rolesItems.length > 0 ? Number(rolesItems[0].IDRol) : NaN;

        // 2) Expedientes donde el usuario es jefe de proyecto
        const jefeProjectExpSet: Record<number, boolean> = {};
        if (!isNaN(jefeProyectoRolId)) {
          const userEscName = escapeOData(userDisplayName);
          const userEscEmail = escapeOData(userEmail || "");
          const rolesUsuarioItems: any[] = await sp.web.lists
            .getByTitle("Roles_usuario")
            .items.filter(
              `IDRol eq ${jefeProyectoRolId} and (Title eq '${userEscName}' or substringof('${userEscEmail}', usuario))`,
            )
            .select("IDExpediente")
            .top(5000)
            .getAll();
          rolesUsuarioItems.forEach((r) => {
            const expId = Number(r.IDExpediente);
            if (isFinite(expId) && expId > 0) jefeProjectExpSet[expId] = true;
          });
        }

        // 3) Cargar revisiones pendientes (cualquier aprobador puede actuar)
        const revisionesPend: any[] = await sp.web.lists
          .getByTitle("Revisiones")
          .items.filter(`EstadoRevision eq 'Pendiente'`)
          .select("IDTareaDocumental", "Title", "IDRevisor")
          .top(5000)
          .getAll();
        const revisionTaskSet: Record<number, boolean> = {};
        revisionesPend.forEach((rev) => {
          const taskId = Number(rev.IDTareaDocumental);
          if (!isFinite(taskId) || taskId <= 0) return;
          const byTitle = normalize(rev.Title) === userNameNorm;
          const byEmail = normalize(rev.IDRevisor) === userEmailNorm;
          if (byTitle || (!!userEmailNorm && byEmail)) {
            revisionTaskSet[taskId] = true;
          }
        });

        // 4) Firmas pendientes del usuario
        const firmasPend: any[] = await sp.web.lists
          .getByTitle("Firmas")
          .items.filter(`EstadoFirma eq 'Pendiente'`)
          .select("IDTareaDocumental", "Title", "IDFirmante")
          .top(5000)
          .getAll();
        const firmaTaskSet: Record<number, boolean> = {};
        firmasPend.forEach((f) => {
          const taskId = Number(f.IDTareaDocumental);
          if (!isFinite(taskId) || taskId <= 0) return;
          const byTitle = normalize(f.Title) === userNameNorm;
          const byEmail = normalize(f.IDFirmante) === userEmailNorm;
          if (byTitle || (!!userEmailNorm && byEmail)) {
            firmaTaskSet[taskId] = true;
          }
        });

        // 5) Cargar tareas relevantes para reglas 2 y 3
        const tareas: any[] = await sp.web.lists
          .getByTitle("TareasDocumentales")
          .items.select(
            "IDTarea",
            "Title",
            "EstadoTarea",
            "Responsable",
            "Elaborador",
            "IDProyecto",
            "FechaDeadline",
            "EsEntregable",
            "FechaEntrega",
          )
          .top(5000)
          .getAll();

        // Nemotecnico del expediente por IDProyecto de cada tarea
        const projectIds = Array.from(
          new Set(
            tareas
              .map((t) => Number(t.IDProyecto || 0))
              .filter((id) => Number.isFinite(id) && id > 0),
          ),
        );
        const nemotecnicoByProjectId: Record<number, string> = {};
        if (projectIds.length > 0) {
          const expedientes: any[] = await sp.web.lists
            .getByTitle("Expedientes")
            .items.select("IDExpediente", "Nemotecnico")
            .top(5000)
            .getAll();
          expedientes.forEach((exp) => {
            const expId = Number(exp.IDExpediente);
            if (!Number.isFinite(expId) || expId <= 0) return;
            if (projectIds.indexOf(expId) < 0) return;
            const nemo = String(exp.Nemotecnico || "").trim();
            if (nemo) nemotecnicoByProjectId[expId] = nemo;
          });
        }

        const flow: ITaskNotif[] = [];
        const nearDeadline: ITaskNotif[] = [];
        const pendingDelivery: ITaskNotif[] = [];
        const now = new Date();
        const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const toNotif = (
          idTarea: number,
          title: string,
          estado: string,
          responsable: string,
          expId: number,
          deadlineRaw: string,
        ): ITaskNotif => ({
          idTarea,
          title,
          estado,
          responsable,
          nemotecnico: nemotecnicoByProjectId[expId] || "",
          deadline: deadlineRaw,
        });

        tareas.forEach((t) => {
          const idTarea = Number(t.IDTarea);
          if (!isFinite(idTarea) || idTarea <= 0) return;

          const estado = String(t.EstadoTarea || "");
          const title = String(t.Title || "");
          const responsable = String(t.Responsable || "");
          const elaboradorRaw = String(t.Elaborador || "");
          const deadlineRaw = t.FechaDeadline ? String(t.FechaDeadline) : "";
          const expId = Number(t.IDProyecto || 0);
          const esEntregable = !!t.EsEntregable;
          const fechaEntrega = t.FechaEntrega ? String(t.FechaEntrega) : "";

          // Regla 1: tareas que dependen del usuario logado
          if (normalize(estado) === "enrevision") {
            if (revisionTaskSet[idTarea]) {
              flow.push(
                toNotif(idTarea, title, estado, responsable, expId, deadlineRaw),
              );
            }
          } else if (normalize(estado) === "enfirma") {
            if (firmaTaskSet[idTarea]) {
              flow.push(
                toNotif(idTarea, title, estado, responsable, expId, deadlineRaw),
              );
            }
          }

          // Condición de relación usuario para reglas 2 y 3
          const isResp = normalize(responsable) === userNameNorm;
          const isElab = isUserInElaboradores(
            elaboradorRaw,
            userNameNorm,
            userEmailNorm,
          );
          const isJefeProyecto = !!jefeProjectExpSet[expId];
          const userRelated = isResp || isElab || isJefeProyecto;

          // Regla 2: deadline < 7 días y no finalizada
          if (userRelated && deadlineRaw && !isFinalState(estado)) {
            const d = new Date(deadlineRaw);
            if (!isNaN(d.getTime()) && d >= now && d <= weekAhead) {
              nearDeadline.push(
                toNotif(idTarea, title, estado, responsable, expId, deadlineRaw),
              );
            }
          }

          // Regla 3: requiere entrega, no entregada y en estado Versionado
          if (
            userRelated &&
            esEntregable &&
            !fechaEntrega &&
            normalize(estado) === "aprobado"
          ) {
            pendingDelivery.push(
              toNotif(idTarea, title, estado, responsable, expId, deadlineRaw),
            );
          }
        });

        setFlowTasks(flow);
        setDeadlineTasks(nearDeadline);
        setDeliveryTasks(pendingDelivery);
        const totalPending = flow.length + nearDeadline.length + pendingDelivery.length;
        localStorage.setItem(
          NOTIFICATIONS_COUNT_STORAGE_KEY,
          String(totalPending),
        );
        window.dispatchEvent(new Event("notifications-count-updated"));
      } catch (e) {
        console.error("Error cargando notificaciones:", e);
        setError("No se pudieron cargar las notificaciones.");
        setFlowTasks([]);
        setDeadlineTasks([]);
        setDeliveryTasks([]);
        localStorage.setItem(NOTIFICATIONS_COUNT_STORAGE_KEY, "0");
        window.dispatchEvent(new Event("notifications-count-updated"));
      } finally {
        setLoading(false);
      }
    };

    void loadNotifications();
  }, [userNameNorm, userEmailNorm]);

  const renderList = (items: ITaskNotif[], actionText: string): React.ReactNode => {
    if (!items.length) {
      return <p className={styles.empty}>No hay notificaciones en esta categoría.</p>;
    }
    return (
      <ul className={styles.list}>
        {items.map((t) => (
          <li key={`${actionText}-${t.idTarea}`} className={styles.item}>
            <div className={styles.itemMain}>
              <p className={styles.itemTitle}>
                {t.nemotecnico || "—"} - {t.title || "Sin título"}
              </p>
              <p className={styles.itemMeta}>
                Estado: <strong>{t.estado || "-"}</strong>
                {t.deadline ? (
                  <>
                    {" "}
                    | Deadline:{" "}
                    <strong>{new Date(t.deadline).toLocaleDateString("es-ES")}</strong>
                  </>
                ) : null}
              </p>
            </div>
            <a
              className={styles.actionLink}
              href={`${absolutePath}/SitePages/detalle-tarea.aspx?tareaid=${t.idTarea}`}
            >
              {actionText}
            </a>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section className={`${styles.notifications} ${hasTeamsContext ? styles.teams : ""}`}>
      {loading ? (
        <Loading message="Cargando notificaciones..." />
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          <h2 className={styles.title}>Notificaciones</h2>

          <div className={styles.block}>
            <h3>Tareas pendientes de tu acción</h3>
            {renderList(flowTasks, "Ir a la acción")}
          </div>

          <div className={styles.block}>
            <h3>Deadline en menos de una semana</h3>
            {renderList(deadlineTasks, "Actualizar tarea")}
          </div>

          <div className={styles.block}>
            <h3>Entregables pendientes de declarar</h3>
            {renderList(deliveryTasks, "Declarar entrega")}
          </div>
        </>
      )}
    </section>
  );
};

export default Notifications;
