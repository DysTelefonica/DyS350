import * as React from "react";
import styles from "./ProyectDetail.module.scss";
import TaskList from "../../../ui/taskList/TaskList";
import { IProyectDetailProps } from "./IProyectDetailProps";
import { sp } from "@pnp/sp";
import ProjectDocumentation from "../../../ui/projectDocumentation/ProjectDocumentation";
import ProjectSummary from "../../../ui/projectSummary/ProjecSummary";
import ProjectLinks from "../../../ui/projectLinks/ProjectLinks";

const FLOW_ESTADOS: string[] = ["EnRevision", "EnFirma"];
const JEFE_PROYECTO_ROL_ID = 2;

const contentSections = [
  "expedientes",
  "tareas",
  "documentos",
  "flujos",
  "sharepoint",
  "adhoc",
] as const;

const navigationSections = [...contentSections, "planner"] as const;

type ContentSection = (typeof contentSections)[number];
type NavigationSection = (typeof navigationSections)[number];

const sectionLabels: Record<NavigationSection, string> = {
  expedientes: "Resumen del expediente",
  tareas: "Tareas documentales",
  sharepoint: "Biblioteca de trabajo",
  flujos: "Flujos",
  documentos: "Repositorio final",
  adhoc: "Adhoc",
  planner: "Planner",
};

const ProyectDetail: React.FC<IProyectDetailProps> = ({
  context,
  itemsPerPage,
}) => {
  const [activeSection, setActiveSection] =
    React.useState<ContentSection>("expedientes");
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [projectNemotecnico, setProjectNemotecnico] = React.useState<string>("");
  const [canUploadSharepointDocs, setCanUploadSharepointDocs] =
    React.useState(false);
  const [expedienteListItemId, setExpedienteListItemId] = React.useState<
    number | null
  >(null);
  const [expedientePlanId, setExpedientePlanId] = React.useState("");
  const [isJefeProyecto, setIsJefeProyecto] = React.useState(false);
  const [expedienteDataLoaded, setExpedienteDataLoaded] = React.useState(false);
  const [pendingPlannerOpen, setPendingPlannerOpen] = React.useState(false);
  const [showPlannerNoPlanDialog, setShowPlannerNoPlanDialog] =
    React.useState(false);
  const [showPlannerAssignDialog, setShowPlannerAssignDialog] =
    React.useState(false);
  const [plannerPlanIdInput, setPlannerPlanIdInput] = React.useState("");
  const [isSavingPlanId, setIsSavingPlanId] = React.useState(false);
  const [plannerDialogError, setPlannerDialogError] = React.useState("");

  // Inicializar PnP SP con el contexto
  React.useEffect(() => {
    sp.setup({
      spfxContext: context,
    });
  }, [context]);

  // Obtener el ID del proyecto desde la URL
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectSelected =
      params.get("idproyecto") || params.get("proyectoid");
    setProjectId(projectSelected);
    const tabParam = (params.get("tab") || "").trim().toLowerCase();
    if (
      tabParam &&
      (contentSections as readonly string[]).indexOf(tabParam) >= 0
    ) {
      setActiveSection(tabParam as ContentSection);
    } else if (tabParam === "planner") {
      setPendingPlannerOpen(true);
    }
  }, []);

  React.useEffect(() => {
    const loadUploadPermission = async (): Promise<void> => {
      try {
        if (!projectId) {
          setCanUploadSharepointDocs(false);
          return;
        }
        const projectIdNum = Number(projectId);
        if (isNaN(projectIdNum) || projectIdNum <= 0) {
          setCanUploadSharepointDocs(false);
          return;
        }

        const normalize = (value: unknown): string =>
          String(value || "")
            .trim()
            .toLowerCase();

        const currentNameNorm = normalize(context.pageContext.user.displayName);
        const currentEmailNorm = normalize(context.pageContext.user.email);

        const rolesItems: any[] = await sp.web.lists
          .getByTitle("Roles_usuario")
          .items.filter(`IDExpediente eq ${projectIdNum}`)
          .select("Title", "usuario")
          .top(5000)
          .getAll();

        const isMember = rolesItems.some((item) => {
          const roleName = normalize(item?.Title);
          const roleUser = normalize(item?.usuario);
          return (
            (currentNameNorm && roleName === currentNameNorm) ||
            (currentEmailNorm && roleUser.indexOf(currentEmailNorm) >= 0)
          );
        });
        const currentUserGroups: Array<{ Title?: string }> =
          await sp.web.currentUser.groups.select("Title").get();
        const isSecurityGroupMember = currentUserGroups.some((group) => {
          const groupName = normalize(group?.Title);
          return (
            groupName === "calidad" ||
            groupName === "documentacion" ||
            groupName.indexOf("calidad") >= 0 ||
            groupName.indexOf("documentacion") >= 0
          );
        });

        setCanUploadSharepointDocs(isMember || isSecurityGroupMember);
      } catch (error) {
        console.error("Error validando membresía del expediente:", error);
        setCanUploadSharepointDocs(false);
      }
    };

    void loadUploadPermission();
  }, [projectId, context]);

  React.useEffect(() => {
    const loadExpedientePlannerData = async (): Promise<void> => {
      setExpedienteDataLoaded(false);
      try {
        if (!projectId) {
          setProjectNemotecnico("");
          setExpedienteListItemId(null);
          setExpedientePlanId("");
          setIsJefeProyecto(false);
          return;
        }
        const projectIdNum = Number(projectId);
        if (isNaN(projectIdNum) || projectIdNum <= 0) {
          setProjectNemotecnico("");
          setExpedienteListItemId(null);
          setExpedientePlanId("");
          setIsJefeProyecto(false);
          return;
        }

        const normalize = (value: unknown): string =>
          String(value || "")
            .trim()
            .toLowerCase();

        const currentNameNorm = normalize(context.pageContext.user.displayName);
        const currentEmailNorm = normalize(context.pageContext.user.email);

        const items: Array<{ Id?: number; Nemotecnico?: string; PlanId?: string }> =
          await sp.web.lists
            .getByTitle("Expedientes")
            .items.filter(`IDExpediente eq ${projectIdNum}`)
            .select("Id", "Nemotecnico", "PlanId")
            .top(1)
            .get();

        if (items.length > 0) {
          const expItem = items[0];
          setExpedienteListItemId(Number(expItem.Id) || null);
          setProjectNemotecnico(String(expItem.Nemotecnico || "").trim());
          setExpedientePlanId(String(expItem.PlanId || "").trim());
        } else {
          setExpedienteListItemId(null);
          setProjectNemotecnico("");
          setExpedientePlanId("");
        }

        const rolesRaw: any[] = await sp.web.lists
          .getByTitle("Roles_usuario")
          .items.filter(
            `IDExpediente eq ${projectIdNum} and IDRol eq ${JEFE_PROYECTO_ROL_ID}`,
          )
          .select("Title", "usuario")
          .top(5000)
          .getAll();

        const hasJefeRole = rolesRaw.some((role) => {
          const roleNameNorm = normalize(role?.Title);
          const roleUserNorm = normalize(role?.usuario);
          return (
            (currentNameNorm && roleNameNorm === currentNameNorm) ||
            (currentEmailNorm && roleUserNorm.indexOf(currentEmailNorm) >= 0)
          );
        });
        setIsJefeProyecto(hasJefeRole);
      } catch (error) {
        console.error("Error cargando datos del expediente para Planner:", error);
        setProjectNemotecnico("");
        setExpedienteListItemId(null);
        setExpedientePlanId("");
        setIsJefeProyecto(false);
      } finally {
        setExpedienteDataLoaded(true);
      }
    };

    void loadExpedientePlannerData();
  }, [projectId, context]);

  const buildPlannerUrl = React.useCallback(
    (planId: string): string => {
      const baseUrl = context.pageContext.web.absoluteUrl.replace(/\/$/, "");
      return `${baseUrl}/SitePages/Planner.aspx?PlanId=${encodeURIComponent(planId.trim())}`;
    },
    [context.pageContext.web.absoluteUrl],
  );

  const handlePlannerClick = React.useCallback((): void => {
    const planId = String(expedientePlanId || "").trim();
    if (planId) {
      window.location.href = buildPlannerUrl(planId);
      return;
    }

    setPlannerDialogError("");
    if (isJefeProyecto) {
      setPlannerPlanIdInput("");
      setShowPlannerAssignDialog(true);
      return;
    }
    setShowPlannerNoPlanDialog(true);
  }, [buildPlannerUrl, expedientePlanId, isJefeProyecto]);

  React.useEffect(() => {
    if (!pendingPlannerOpen || !expedienteDataLoaded) return;
    setPendingPlannerOpen(false);
    handlePlannerClick();
  }, [pendingPlannerOpen, expedienteDataLoaded, handlePlannerClick]);

  const handleSavePlanId = async (): Promise<void> => {
    const planIdValue = String(plannerPlanIdInput || "").trim();
    if (!planIdValue) {
      setPlannerDialogError("Debes introducir un PlanId.");
      return;
    }
    if (!expedienteListItemId) {
      setPlannerDialogError("No se pudo identificar el expediente.");
      return;
    }

    setIsSavingPlanId(true);
    setPlannerDialogError("");
    try {
      await sp.web.lists
        .getByTitle("Expedientes")
        .items.getById(expedienteListItemId)
        .update({ PlanId: planIdValue });
      setExpedientePlanId(planIdValue);
      setShowPlannerAssignDialog(false);
      window.location.href = buildPlannerUrl(planIdValue);
    } catch (error) {
      console.error("Error guardando PlanId del expediente:", error);
      setPlannerDialogError("No se pudo guardar el PlanId. Inténtalo de nuevo.");
    } finally {
      setIsSavingPlanId(false);
    }
  };

  const handleNavigationClick = (
    section: NavigationSection,
    event: React.MouseEvent<HTMLAnchorElement>,
  ): void => {
    event.preventDefault();
    if (section === "planner") {
      handlePlannerClick();
      return;
    }
    setActiveSection(section);
  };

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentTab = (params.get("tab") || "").trim().toLowerCase();
    if (currentTab === activeSection) return;
    params.set("tab", activeSection);
    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash || ""}`;
    window.history.replaceState({}, "", newUrl);
  }, [activeSection]);

  const renderSection = (id: string, content: React.ReactNode) =>
    activeSection === id ? (
      <section id={id} className={`${styles.contentSection} ${styles.active}`}>
        {content}
      </section>
    ) : null;

  return (
    <div className={styles.appLayout}>
      {/* SIDEBAR */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.logo}>
            Expediente {projectId}
            {projectNemotecnico ? ` - ${projectNemotecnico}` : ""}
          </span>
        </div>

        <nav className={styles.sidebarNav}>
          {navigationSections.map((section) => (
            <a
              key={section}
              href="#"
              role="button"
              className={`${styles.navItem} ${
                activeSection === section ? styles.activeTab : ""
              }`}
              onClick={(event) => handleNavigationClick(section, event)}
            >
              {sectionLabels[section]}
            </a>
          ))}
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className={styles.content}>
        {renderSection(
          "expedientes",
          <ProjectSummary context={context} projectId={projectId} />,
        )}

        {renderSection(
          "tareas",
          <TaskList
            context={context}
            projectId={projectId}
            itemsPerPage={itemsPerPage}
          />,
        )}
        {renderSection(
          "sharepoint",
          <ProjectDocumentation
            context={context}
            projectId={projectId}
            selectable={false}
            allowUpload={canUploadSharepointDocs}
            enableSearchInDocumentacion={true}
          />,
        )}
        {renderSection(
          "flujos",
          <TaskList
            context={context}
            projectId={projectId}
            itemsPerPage={itemsPerPage}
            listTitle="Flujos pendientes del expediente"
            forcedEstados={FLOW_ESTADOS}
            showFlowColumns={true}
          />,
        )}
        {renderSection(
          "documentos",
          <ProjectDocumentation
            context={context}
            projectId={projectId}
            libraryName="DocumentacionArchivo"
            selectable={false}
            enableSearchInDocumentacion={true}
          />,
        )}
        {renderSection(
          "adhoc",
          <ProjectLinks context={context} projectId={projectId} />,
        )}
      </main>

      {showPlannerNoPlanDialog ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={() => setShowPlannerNoPlanDialog(false)}
        >
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-no-plan-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="planner-no-plan-title" className={styles.confirmDialogTitle}>
              Planner no disponible
            </h4>
            <p className={styles.confirmDialogMessage}>
              Este expediente no tiene aún un planner asignado.
            </p>
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmPrimaryButton}
                onClick={() => setShowPlannerNoPlanDialog(false)}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPlannerAssignDialog ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={() => {
            if (!isSavingPlanId) {
              setShowPlannerAssignDialog(false);
            }
          }}
        >
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-assign-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="planner-assign-title" className={styles.confirmDialogTitle}>
              Asignar Planner
            </h4>
            <p className={styles.confirmDialogMessage}>
              Este expediente no tiene aún un planner asignado. Introduce el
              PlanId para vincularlo y abrir Planner.
            </p>
            <label className={styles.plannerFieldLabel} htmlFor="planner-plan-id">
              PlanId
            </label>
            <input
              id="planner-plan-id"
              type="text"
              className={styles.plannerFieldInput}
              value={plannerPlanIdInput}
              onChange={(event) => setPlannerPlanIdInput(event.target.value)}
              disabled={isSavingPlanId}
              placeholder="Introduce el PlanId"
            />
            {plannerDialogError ? (
              <p className={styles.plannerDialogError}>{plannerDialogError}</p>
            ) : null}
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmCancelButton}
                onClick={() => setShowPlannerAssignDialog(false)}
                disabled={isSavingPlanId}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmPrimaryButton}
                onClick={() => void handleSavePlanId()}
                disabled={isSavingPlanId}
              >
                {isSavingPlanId ? "Guardando..." : "Aceptar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ProyectDetail;
