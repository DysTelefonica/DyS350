import * as React from 'react';
import styles from "./projectSummary.module.scss";
import Loading from '../loading/Loading';
import { sp } from "@pnp/sp";
import { WebPartContext } from "@microsoft/sp-webpart-base";

interface ISupplierNode {
  id: number;
  title: string;
  isJuridica: boolean;
  contratistaPrincipal: boolean;
  subcontratista: boolean;
  children: ISupplierNode[];
}

interface IProjectData {
  Title: string;
  IDExpediente: number;
  Nemotecnico: string;
  CodS4h: number | null;
  ImporteContratacion: number | null;
  FechaInicioContrato: string | null;
  FechaFinContrato: string | null;
  FechaFinGarantia: string | null;
  Estado: string | null;
  CodExp: string | null;
  Cliente: string | null;
  /** Lista de suministradores (Title de la lista Suministradores) asociados al IDExpediente. */
  juridicaList?: string[];
  /** Nombre del siguiente hito/fase calculado a partir de la lista Hitos. */
  nextHitoNombre?: string | null;
  /** Días restantes para el siguiente hito. */
  diasRestantesProximoHito?: number | null;
  /** Expediente padre relacionado (si existe). */
  parentExpediente?: {
    id: number;
    title: string;
    nemotecnico?: string | null;
  } | null;
  /** Expedientes hijos relacionados. */
  childExpedientes?: {
    id: number;
    title: string;
    nemotecnico?: string | null;
  }[];
  /** Árbol de suministradores asociados al proyecto. */
  suministradoresTree?: ISupplierNode[];
  // tiposproyecto: string | null;
}


const ProjectSummary = ({ context, projectId }: { context: WebPartContext; projectId: string | null; }) => {
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    // const [projectId, setProjectId] = React.useState<string | null>(null);
    const [projectData, setProjectData] =
    React.useState<IProjectData | null>(null);
    const absolutePath = context.pageContext.web.absoluteUrl;

      // Obtener el ID del proyecto desde la URL
    //   React.useEffect(() => {
    //     const params = new URLSearchParams(window.location.search);
    //     const projectSelected =
    //       params.get("idproyecto") || params.get("proyectoid");
    //     setProjectId(projectSelected);
    //   }, []);


      // Cargar datos del proyecto desde SharePoint
      React.useEffect(() => {
        const loadProjectData = async () => {
          if (!projectId) {
            setLoading(false);
            return;
          }
    
          try {
            setLoading(true);
            setError(null);
    
            const idExpediente = parseInt(projectId, 10);
            if (isNaN(idExpediente)) {
              throw new Error("ID de proyecto inválido");
            }
    
            // Buscar el proyecto por IDExpediente
            const items: any[] = await sp.web.lists
              .getByTitle("Expedientes")
              .items.filter(`IDExpediente eq ${idExpediente}`)
              .select(
                "Title",
                "IDExpediente",
                "IDExpedientePadre",
                "Nemotecnico",
                "CodS4h",
                "ImporteContratacion",
                "FechaInicioContrato",
                "FechaFinContrato",
                "FechaFinGarantia",
                "Estado",
                "CodExp",
                "Cliente",
              )
              .get();
    
            if (items.length === 0) {
              throw new Error("Expediente no encontrado");
            }
    
            const expItem = items[0];
    
            const suministradores: any[] = await sp.web.lists
              .getByTitle("Suministradores")
              .items.filter(`IDProyecto eq ${idExpediente}`)
              .select(
                "Title",
                "IDSuministrador",
                "IDExpedienteSuministrador",
                "IDPadre",
                "IDProyecto",
                "ContratistaPrincipal",
                "Subcontratista",
                "EsJuridica",
              )
              .top(5000)
              .get();
    
            const juridicaList =
              suministradores
                ?.map((s) => (s.Title as string) || "")
                .filter((t) => !!t) ?? [];
    
            // Construir árbol de suministradores
            const supplierById = new Map<number, ISupplierNode>();
    
            suministradores.forEach((s) => {
              // Usamos IDExpedienteSuministrador como identificador del nodo en el árbol
              const idRaw =
                s.IDSuministrador ?? s.idsuministrador;
              const id = Number(idRaw);
              // @ts-ignore
              if (!id || Number.isNaN(id)) return;
    
              if (!supplierById.has(id)) {
                supplierById.set(id, {
                  id,
                  title: (s.Title as string) || "",
                  isJuridica: !!s.EsJuridica,
                  contratistaPrincipal: !!s.ContratistaPrincipal,
                  subcontratista: !!s.Subcontratista,
                  children: [],
                });
              }
            });
    
            const supplierRoots: ISupplierNode[] = [];
    
            suministradores.forEach((s) => {
              const idRaw =
                s.IDSuministrador ?? s.idsuministrador;
              const id = Number(idRaw);
              // @ts-ignore
              if (!id || Number.isNaN(id)) return;
    
              const node = supplierById.get(id);
              if (!node) return;
    
              // Primer nivel: suministradores sin IDPadre
              // Hijos: aquellos cuyo IDPadre coincide con el IDExpedienteSuministrador del padre
              const parentRaw = s.IDPadre ?? s.idpadre;
              const parentId = parentRaw != null ? Number(parentRaw) : NaN;
    
              if (parentId && supplierById.has(parentId)) {
                supplierById.get(parentId)!.children.push(node);
              } else {
                supplierRoots.push(node);
              }
            });
    
            // Cargar expediente padre (si existe)
            let parentExpediente: {
              id: number;
              title: string;
              nemotecnico?: string | null;
            } | null = null;
    
            if (expItem.IDExpedientePadre) {
              const padreItems: any[] = await sp.web.lists
                .getByTitle("Expedientes")
                .items.filter(`IDExpediente eq ${expItem.IDExpedientePadre}`)
                .select("IDExpediente", "Title", "Nemotecnico")
                .top(1)
                .get();
    
              if (padreItems.length) {
                parentExpediente = {
                  id: padreItems[0].IDExpediente,
                  title: padreItems[0].Title,
                  nemotecnico: padreItems[0].Nemotecnico,
                };
              }
            }
    
            // Cargar expedientes hijos
            const hijosItems: any[] = await sp.web.lists
              .getByTitle("Expedientes")
              .items.filter(`IDExpedientePadre eq ${idExpediente}`)
              .select("IDExpediente", "Title", "Nemotecnico")
              .top(5000)
              .get();
    
            const childExpedientes =
              hijosItems?.map((h) => ({
                id: h.IDExpediente as number,
                title: (h.Title as string) || "",
                nemotecnico: (h.Nemotecnico as string) || "",
              })) ?? [];
  
            // Cargar hitos para calcular fase actual y días restantes
            const hitos: any[] = await sp.web.lists
              .getByTitle("Hitos")
              .items.filter(`IDProyecto eq ${idExpediente}`)
              .select("Title", "FechaHito")
              .top(5000)
              .get();
    
            let nextHitoNombre: string | null = null;
            let diasRestantesProximoHito: number | null = null;
    
            if (Array.isArray(hitos) && hitos.length) {
              const hoy = new Date();
              const hoySinHora = new Date(
                hoy.getFullYear(),
                hoy.getMonth(),
                hoy.getDate(),
              );
    
              const futuros = hitos
                .map((h) => {
                  const fecha = h.FechaHito ? new Date(h.FechaHito) : null;
                  return fecha && fecha >= hoySinHora
                    ? { title: (h.Title as string) || "", fecha }
                    : null;
                })
                .filter(
                  (h): h is { title: string; fecha: Date } => h !== null,
                )
                .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    
              if (futuros.length) {
                // Hito/fase actual: el más próximo en el futuro
                const actual = futuros[0];
                nextHitoNombre = actual.title;
    
                // Próximo hito: el siguiente en la lista (si existe)
                if (futuros.length > 1) {
                  const proximo = futuros[1];
                  const diffMs = proximo.fecha.getTime() - hoySinHora.getTime();
                  diasRestantesProximoHito = Math.ceil(
                    diffMs / (1000 * 60 * 60 * 24),
                  );
                } else {
                  diasRestantesProximoHito = null;
                }
              }
            }

            setProjectData({
              ...expItem,
              Cliente: expItem.Cliente ?? null,
              juridicaList,
              nextHitoNombre,
              diasRestantesProximoHito,
              parentExpediente,
              childExpedientes,
              suministradoresTree: supplierRoots,
            });
          } catch (err: any) {
            console.error("Error cargando Expediente desde SharePoint:", err);
            setError(err.message || "Error al cargar los datos del Expediente");
          } finally {
            setLoading(false);
          }
        };
    
        void loadProjectData();
      }, [projectId]);
    
      const formatDate = (dateString: string | null): string => {
        if (!dateString) return "";
        try {
          const date = new Date(dateString);
          return date.toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
        } catch {
          return "";
        }
      };
    
      const formatCurrency = (amount: number | null): string => {
        if (!amount) return "N/A";
        return new Intl.NumberFormat("es-ES", {
          style: "currency",
          currency: "EUR",
        }).format(amount);
      };

      const renderSupplierNodes = (nodes: ISupplierNode[]): React.ReactNode => {
    if (!nodes || !nodes.length) return null;
    return (
      <ul className={styles.supplierList}>
        {nodes.map((node) => (
          <li key={node.id} className={styles.supplierNode}>
            <div className={styles.supplierNodeHeader}>
              <span className={styles.supplierName}>{node.title}</span>
              {node.contratistaPrincipal && (
                <span className={styles.supplierTag}>Contratista principal</span>
              )}
              {node.subcontratista && (
                <span className={styles.supplierTagSecondary}>
                  Subcontratista
                </span>
              )}
              {node.isJuridica && (
                <span className={styles.supplierTagJuridica}>Jurídica</span>
              )}
            </div>
            {node.children && node.children.length > 0 && (
              <div className={styles.supplierChildren}>
                {renderSupplierNodes(node.children)}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };
    
    return (
                  <div className={styles.containerProyectos}>
            {loading && <Loading message="Cargando datos del expediente..." />}
            {error && <div className={styles.errorMessage}>{error}</div>}
            {!loading && !error && projectData && (
              <>
                {/* HEADER */}
                <section className={`${styles.card} ${styles.projectHeader}`}>
                  <div>
                    <h2>{projectData.Title || "Sin título"}</h2>
                    <span className={styles.projectId}>
                      ID: {projectData.IDExpediente}
                      {projectData.Nemotecnico &&
                        ` - ${projectData.Nemotecnico}`}
                    </span>
                  </div>

                  <span
                    className={`${styles.statusBadge} ${styles.statusEjecucion}`}
                  >
                    {projectData.Estado || "Sin estado"}
                  </span>
                </section>

                {/* RESUMEN */}
                <section className={styles.card}>
                  <h3 className={styles.sectionTitle}>Resumen del proyecto</h3>

                  <div className={styles.projectGrid}>
                    {projectData.CodS4h && (
                      <div className={styles.proyectItem}>
                        <span className={styles.label}>Código S4H</span>
                        <span className={styles.value}>
                          {projectData.CodS4h}
                        </span>
                      </div>
                    )}

                    {projectData.CodExp && (
                      <div className={styles.proyectItem}>
                        <span className={styles.label}>Código Expediente</span>
                        <span className={styles.value}>
                          {projectData.CodExp}
                        </span>
                      </div>
                    )}

                    {/* {projectData.tiposproyecto && (
                      <div className={styles.proyectItem}>
                        <span className={styles.label}>tiposproyecto</span>
                        <span className={styles.value}>
                          {projectData.tiposproyecto}
                        </span>
                      </div>
                    )} */}

                    <div className={styles.proyectItem}>
                      <span className={styles.label}>Importe total</span>
                      <span className={styles.value}>
                        {formatCurrency(projectData.ImporteContratacion)}
                      </span>
                    </div>

                    {projectData.Cliente && (
                      <div className={styles.proyectItem}>
                        <span className={styles.label}>Cliente</span>
                        <span className={styles.value}>
                          {projectData.Cliente}
                        </span>
                      </div>
                    )}

                    {(projectData.FechaInicioContrato ||
                      projectData.FechaFinContrato) && (
                      <div className={styles.proyectItem}>
                        <span className={styles.label}>Fechas</span>
                        <span className={styles.value}>
                          {formatDate(projectData.FechaInicioContrato)} –{" "}
                          {formatDate(projectData.FechaFinContrato)}
                        </span>
                      </div>
                    )}

                    {projectData.FechaFinGarantia && (
                      <div className={styles.proyectItem}>
                        <span className={styles.label}>Fecha fin garantía</span>
                        <span className={styles.value}>
                          {formatDate(projectData.FechaFinGarantia)}
                        </span>
                      </div>
                    )}

                    {projectData.juridicaList &&
                      projectData.juridicaList.length > 0 && (
                        <div className={styles.proyectItem}>
                          <span className={styles.label}>Jurídica</span>
                          <span className={styles.value}>
                            {projectData.juridicaList.join(", ")}
                          </span>
                        </div>
                      )}
                  </div>
                </section>
                {/* ESTADO */}
                <section className={styles.card}>
                  <h3 className={styles.sectionTitle}>Estado del proyecto</h3>

                  <div className={styles.kpiGrid}>
                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>
                        Fase actual
                      </span>
                      <span className={styles.kpiValue}>
                        {projectData.nextHitoNombre || "Sin próximos hitos"}
                      </span>
                    </div>

                    <div className={styles.kpi}>
                      <span className={styles.kpiLabel}>
                        Días restantes para el siguiente hito
                      </span>
                      <span className={styles.kpiValue}>
                        {projectData.diasRestantesProximoHito != null
                          ? `${projectData.diasRestantesProximoHito} días`
                          : "Sin próximos hitos"}
                      </span>
                    </div>
                  </div>
                </section>

            {/* EXPEDIENTES RELACIONADOS */}
            <section className={styles.card}>
              <h3 className={styles.sectionTitle}>Expedientes relacionados</h3>

              <div className={styles.relatedGrid}>
                <div className={styles.relatedColumn}>
                  <h4 className={styles.relatedTitle}>Padre</h4>
                  {projectData.parentExpediente ? (
                    <a
                      className={styles.relatedLink}
                      href={`${absolutePath}/SitePages/detalle-proyecto.aspx?proyectoid=${projectData.parentExpediente.id}`}
                    >
                      {projectData.parentExpediente.nemotecnico &&
                        `${projectData.parentExpediente.nemotecnico} - `}{" "}
                      {projectData.parentExpediente.title}
                    </a>
                  ) : (
                    <span className={styles.relatedEmpty}>
                      Sin expediente padre
                    </span>
                  )}
                </div>

                <div className={styles.relatedColumn}>
                  <h4 className={styles.relatedTitle}>Hijos</h4>
                  {projectData.childExpedientes &&
                  projectData.childExpedientes.length ? (
                    <ul className={styles.relatedList}>
                      {projectData.childExpedientes.map((hijo) => (
                        <li key={hijo.id}>
                          <a
                            className={styles.relatedLink}
                            href={`${absolutePath}/SitePages/detalle-proyecto.aspx?proyectoid=${hijo.id}`}
                          >
                            {hijo.nemotecnico && `${hijo.nemotecnico} - `}{" "}
                            {hijo.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className={styles.relatedEmpty}>
                      Sin expedientes hijos
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* ÁRBOL DE SUMINISTRADORES */}
            <section className={styles.card}>
              <h3 className={styles.sectionTitle}>Árbol de suministradores</h3>
              {projectData.suministradoresTree &&
              projectData.suministradoresTree.length ? (
                <div className={styles.supplierTree}>
                  {renderSupplierNodes(projectData.suministradoresTree)}
                </div>
              ) : (
                <span className={styles.relatedEmpty}>
                  Sin suministradores para este proyecto
                </span>
              )}
            </section>
              </>
            )}
          </div>
    )
}

export default ProjectSummary;