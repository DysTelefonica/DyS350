// @ts-nocheck
import * as React from "react";
import { useMemo, useState } from "react";
import Pagination from "../../../ui/pagination/Pagination";
import type { IProyectItem, IProyectListProps } from "./IProyectListProps";
import styles from "./ProyectList.module.scss";
// import { escape } from "@microsoft/sp-lodash-subset";
import { sp } from "@pnp/sp";
import {
  // Checkbox,
  DatePicker,
  DayOfWeek,
} from "office-ui-fabric-react";
// import { PrimaryButton } from "@fluentui/react";
// import ProjectCharts from "../../../ui/projectcharts/ProjectCharts";
const DEFAULT_ITEMS_PER_PAGE = 10;

const normalize = (text = "") =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const formatKqlDate = (date: Date): string => {
  const dd = date.getDate();
  const mm = date.getMonth() + 1;
  const yyyy = date.getFullYear();

  const ddStr = dd < 10 ? `0${dd}` : `${dd}`;
  const mmStr = mm < 10 ? `0${mm}` : `${mm}`;

  return `${ddStr}/${mmStr}/${yyyy}`;
};

const formatDateDisplay = (value?: string): string => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";

  const dd = d.getDate();
  const mm = d.getMonth() + 1;
  const yyyy = d.getFullYear();

  const ddStr = dd < 10 ? `0${dd}` : `${dd}`;
  const mmStr = mm < 10 ? `0${mm}` : `${mm}`;

  return `${ddStr}/${mmStr}/${yyyy}`;
};

const getFormatDate = (date?: Date | null): string => {
  if (!date) return "";

  const dd = date.getDate();
  const mm = date.getMonth() + 1;
  const yyyy = date.getFullYear();

  const ddStr = dd < 10 ? `0${dd}` : `${dd}`;
  const mmStr = mm < 10 ? `0${mm}` : `${mm}`;

  return `${ddStr}/${mmStr}/${yyyy}`;
};

const ProyectList: React.FC<IProyectListProps> = ({
  context,
  itemsPerPage,
}) => {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [allProjects, setAllProjects] = useState<IProyectItem[]>([]);
  const [myProyectsIsSelected, setMyProyectsIsSelected] =
    useState<boolean>(false);
  const [clienteFilter, setClienteFilter] = useState<string>("");
  const [juridicaFilter, setJuridicaFilter] = useState<string>("");
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>();
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>();
  // const [menuAddOpen, setMenuAddOpen] = useState<boolean>(false);
  const _urlAssets = "SiteAssets/Img";
  const absolutePath = context.pageContext.web.absoluteUrl;
  const [totalRows, setTotalRows] = useState<number>(0);
  const [juridicasMaster, setJuridicasMaster] = useState<string[]>([]);
  const [clientesMaster, setClientesMaster] = useState<string[]>([]);
  const [estadosMaster, setEstadosMaster] = useState<string[]>([]);
  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [canAddProject, setCanAddProject] = useState<boolean>(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(false);
  // const addIcon: IIconProps = { iconName: "Add" };
  const filteredAndSorted = useMemo(() => {
    // No reordenamos ni filtramos por usuario aquí para respetar
    // el orden y filtros aplicados ya en el servidor (Search API).
    return allProjects;
  }, [allProjects]);

  const pageSize =
    typeof itemsPerPage === "number" && itemsPerPage > 0
      ? itemsPerPage
      : DEFAULT_ITEMS_PER_PAGE;

  const totalPages =
    totalRows > 0 ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;

  const projects = useMemo(() => {
    return filteredAndSorted;
  }, [filteredAndSorted]);

  const uniqueClientes = useMemo(() => {
    return Array.from(new Set(clientesMaster)).sort();
  }, [clientesMaster]);

  const uniqueJuridicas = useMemo(() => {
    return Array.from(new Set(juridicasMaster)).sort();
  }, [juridicasMaster]);

  const uniqueEstados = useMemo(() => {
    return Array.from(new Set(estadosMaster)).sort();
  }, [estadosMaster]);

  const handlePeoplePickerChange = () => {
    console.log("picker change");
  };

  const handleFavorite = async (project: IProyectItem) => {
    const newValue = !project.favorito;

    // Actualización optimista en el estado local
    setAllProjects((prev) =>
      prev.map((p) =>
        p.idexpediente === project.idexpediente
          ? { ...p, favorito: newValue }
          : p,
      ),
    );
    setPage(1);

    try {
      // Buscar el item de la lista "Expedientes" por IDExpediente
      const items: any[] = await sp.web.lists
        .getByTitle("Expedientes")
        .items.select("Id", "IDExpediente")
        .filter(`IDExpediente eq ${project.idexpediente}`)
        .top(1)
        .get();

      if (items.length) {
        const listItemId = items[0].Id as number;
        await sp.web.lists
          .getByTitle("Expedientes")
          .items.getById(listItemId)
          .update({
            Favorito: newValue,
          });
      }
    } catch (err) {
      console.error("Error actualizando favorito en SharePoint:", err);
      // Revertir cambio local si falla la actualización en SharePoint
      setAllProjects((prev) =>
        prev.map((p) =>
          p.idexpediente === project.idexpediente
            ? { ...p, favorito: project.favorito }
            : p,
        ),
      );
    }
  };

  // Inicializar PnP SP con el contexto del webpart
  React.useEffect(() => {
    sp.setup({
      spfxContext: context,
    });
  }, [context]);

  React.useEffect(() => {
    const loadCanAddPermission = async () => {
      try {
        const currentUserName = (
          context.pageContext.user.displayName || ""
        ).trim();
        const currentUserEmail = (context.pageContext.user.email || "").trim();

        if (!currentUserName && !currentUserEmail) {
          setCanAddProject(false);
          return;
        }

        const escapeOdata = (value: string): string =>
          value.replace(/'/g, "''");
        const filters: string[] = [];
        if (currentUserName) {
          filters.push(`Title eq '${escapeOdata(currentUserName)}'`);
        }
        if (currentUserEmail) {
          filters.push(`Correo eq '${escapeOdata(currentUserEmail)}'`);
        }

        if (!filters.length) {
          setCanAddProject(false);
          return;
        }

        const approvItems: any[] = await sp.web.lists
          .getByTitle("Aprovisionadores")
          .items.select("Title", "Correo")
          .filter(filters.join(" or "))
          .top(1)
          .get();

        if (approvItems.length > 0) {
          setCanAddProject(true);
          return;
        }

        // Fallback defensivo para diferencias de normalización (mayúsculas/acentos)
        const approvItemsAll: any[] = await sp.web.lists
          .getByTitle("Aprovisionadores")
          .items.select("Title", "Correo")
          .top(5000)
          .getAll();

        const userNameNorm = normalize(currentUserName);
        const userEmailNorm = currentUserEmail.toLowerCase();
        const hasPermission = approvItemsAll.some((item) => {
          const itemNameNorm = normalize((item.Title as string) || "");
          const itemEmailNorm = String(item.Correo || "")
            .trim()
            .toLowerCase();
          return (
            (userNameNorm && itemNameNorm === userNameNorm) ||
            (userEmailNorm && itemEmailNorm === userEmailNorm)
          );
        });

        setCanAddProject(hasPermission);
      } catch (err) {
        console.error("Error validando Aprovisionadores:", err);
        setCanAddProject(false);
      }
    };

    void loadCanAddPermission();
  }, [context]);

  // Cargar catálogo de jurídicas desde la lista juridicasTelefonica
  React.useEffect(() => {
    const loadJuridicasMaster = async () => {
      try {
        const items: any[] = await sp.web.lists
          .getByTitle("juridicasTelefonica")
          .items.select("Title")
          .top(5000)
          .get();

        const titles = items
          .map((it) => (it.Title as string) || "")
          .filter((t) => !!t);

        setJuridicasMaster(titles);
      } catch (err) {
        console.error(
          "Error cargando catálogo de jurídicas (juridicasTelefonica):",
          err,
        );
      }
    };

    void loadJuridicasMaster();
  }, [context]);

  // Cargar catálogo de clientes desde la lista Clientes
  React.useEffect(() => {
    const loadClientesMaster = async () => {
      try {
        const items: any[] = await sp.web.lists
          .getByTitle("Clientes")
          .items.select("Title")
          .top(5000)
          .getAll();

        const titles = items
          .map((it) => (it.Title as string) || "")
          .filter((t) => !!t);

        setClientesMaster(titles);
      } catch (err) {
        console.error("Error cargando catálogo de clientes (Clientes):", err);
      }
    };

    void loadClientesMaster();
  }, [context]);

  // Cargar catálogo de estados desde la lista EstadosProyecto
  React.useEffect(() => {
    const loadEstadosMaster = async () => {
      try {
        const items: any[] = await sp.web.lists
          .getByTitle("EstadosProyecto")
          .items.select("Title")
          .top(5000)
          .getAll();

        const titles = items
          .map((it) => (it.Title as string) || "")
          .filter((t) => !!t);

        setEstadosMaster(titles);
      } catch (err) {
        console.error(
          "Error cargando catálogo de estados (EstadosProyecto):",
          err,
        );
      }
    };

    void loadEstadosMaster();
  }, [context]);

  // Cargar Expedientes usando Search API
  React.useEffect(() => {
    const loadProjects = async () => {
      try {
        setIsLoadingProjects(true);
        const absolutePath = context.pageContext.web.absoluteUrl;

        // Leemos siempre el query param actual para saber si debemos
        // filtrar por "Mis expedientes" en el propio Search API.
        const params = new URLSearchParams(window.location.search);
        const onlyMyProjectsParam = params.get("projects") === "my";

        // Base: limitar a la lista Expedientes
        const kqlParts: string[] = [
          `Path:"${absolutePath}/Lists/Expedientes" AND contentclass:STS_ListItem`,
        ];

        const searchNorm = search.trim();
        if (searchNorm) {
          const escaped = searchNorm.replace(/"/g, '""');
          const isNumeric = /^[0-9]+$/.test(searchNorm);

          if (isNumeric) {
            // Buscar por título, nemotécnico o ID de expediente (propiedad administrada)
            kqlParts.push(
              `(Title:"${escaped}" OR ExpedienteNemotecnico:"${escaped}" OR ExpedienteIDExpediente:${searchNorm})`,
            );
          } else {
            // Buscar por título, nemotécnico o cliente
            kqlParts.push(
              `(Title:"${escaped}" OR ExpedienteNemotecnico:"${escaped}" OR ExpedienteCliente:"${escaped}")`,
            );
          }
        }

        // Filtro por cliente (propiedad administrada ExpedienteCliente)
        if (clienteFilter) {
          const escaped = clienteFilter.replace(/"/g, '""');
          kqlParts.push(`ExpedienteCliente:"${escaped}"`);
        }

        // Filtro por jurídica (propiedad administrada RefinableString04 mapeada desde Juridicas)
        if (juridicaFilter) {
          const escaped = juridicaFilter.replace(/"/g, '""');
          kqlParts.push(`RefinableString04:"${escaped}"`);
        }

        // Filtro por estado (propiedad administrada Estado mapeada desde la columna Estado de Expedientes)
        if (estadoFilter) {
          const escaped = estadoFilter.replace(/"/g, '""');
          kqlParts.push(`Estado:"${escaped}"`);
        }

        // Filtro de "Mis expedientes" (query param projects=my) usando
        // la propiedad administrada RefinableString05 mapeada desde Miembros
        if (onlyMyProjectsParam) {
          const currentUserName = context.pageContext.user.displayName || "";
          const currentUserEmail = context.pageContext.user.email || "";
          const memberFilters: string[] = [];

          if (currentUserName) {
            const escapedUserName = currentUserName.replace(/"/g, '""');
            memberFilters.push(`RefinableString05:"${escapedUserName}"`);
          }
          if (currentUserEmail) {
            const escapedUserEmail = currentUserEmail.replace(/"/g, '""');
            memberFilters.push(`RefinableString05:"${escapedUserEmail}"`);
          }

          if (memberFilters.length) {
            kqlParts.push(`(${memberFilters.join(" OR ")})`);
          }
        }

        // Filtros de fecha inicio / fin contrato usando RefinableDate03/04
        if (startDateFilter) {
          kqlParts.push(`RefinableDate03>=${formatKqlDate(startDateFilter)}`);
        }
        if (endDateFilter) {
          kqlParts.push(`RefinableDate04<=${formatKqlDate(endDateFilter)}`);
        }

        const queryText = kqlParts.join(" AND ");

        const query: any = {
          Querytext: queryText || "*",
          // Paginación en servidor
          RowLimit: pageSize,
          StartRow: (page - 1) * pageSize,
          TrimDuplicates: false,
          SelectProperties: [
            "ExpedienteIDExpediente",
            "Title",
            "CodExp",
            "ExpedienteCliente",
            "RefinableDate03",
            "RefinableDate04",
            "Estado",
            "ExpedienteFavorito",
            "ExpedienteNemotecnico",
          ],
          // Orden global: primero favoritos, luego el resto
          SortList: [
            {
              Property: "RefinableInt00",
              Direction: 1, // 0 asc, 1 desc
            },
          ],
        };

        const res = await sp.search(query);

        const searchItems = res.PrimarySearchResults || [];

        // Cargar suministradores para obtener la información de Jurídica por proyecto
        const suminItems: any[] = await sp.web.lists
          .getByTitle("Suministradores")
          .items.select("Title", "IDProyecto", "EsJuridica")
          .top(5000)
          .getAll();

        const juridicaByProyecto = new Map<number, string[]>();
        suminItems.forEach((s) => {
          // Solo consideramos los suministradores marcados como Jurídica
          if (!s.EsJuridica) return;
          const idProyecto = s.IDProyecto;
          if (typeof idProyecto !== "number") return;
          const nombre = (s.Title as string) || "";
          if (!nombre) return;
          const current = juridicaByProyecto.get(idProyecto) || [];
          current.push(nombre);
          juridicaByProyecto.set(idProyecto, current);
        });

        // Cargar roles de usuario para saber qué expedientes pertenecen al usuario logueado
        const rolesItems: any[] = await sp.web.lists
          .getByTitle("Roles_usuario")
          .items.select("Title", "IDExpediente")
          .top(5000)
          .getAll();

        const miembrosByExpediente = new Map<number, string[]>();
        rolesItems.forEach((r) => {
          const idExp = r.IDExpediente;
          if (typeof idExp !== "number") return;
          const nombre = (r.Title as string) || "";
          if (!nombre) return;
          const current = miembrosByExpediente.get(idExp) || [];
          current.push(nombre);
          miembrosByExpediente.set(idExp, current);
        });

        const currentUserName = context.pageContext.user.displayName || "";

        const mapped: IProyectItem[] = searchItems.map((it: any) => {
          const idExp = it.ExpedienteIDExpediente
            ? Number(it.ExpedienteIDExpediente)
            : 0;

          const juridicaList = juridicaByProyecto.get(idExp) || [];
          const miembros = miembrosByExpediente.get(idExp) || [];
          const hasCurrentUser = miembros.some(
            (name) => normalize(name) === normalize(currentUserName),
          );

          const startRaw = it.RefinableDate03
            ? new Date(it.RefinableDate03)
            : undefined;
          const endRaw = it.RefinableDate04
            ? new Date(it.RefinableDate04)
            : undefined;

          // Normalizamos el valor de Favorito que viene como string ("True"/"False") o null
          const favRaw = it.ExpedienteFavorito as string | null | undefined;
          const favNorm =
            typeof favRaw === "string"
              ? favRaw.toLowerCase() === "true"
              : false;

          return {
            itemId: idExp,
            idexpediente: idExp,
            nemotecnico: it.ExpedienteNemotecnico || "",
            title: it.Title || "",
            expediente: it.CodExp || "",
            startDate: startRaw ? startRaw.toISOString().split("T")[0] : "",
            endDate: endRaw ? endRaw.toISOString().split("T")[0] : "",
            estado: it.Estado || "",
            cliente: it.ExpedienteCliente || "",
            clasificacion: "",
            juridica: juridicaList.join(", "),
            juridicaList,
            miembros,
            hasCurrentUser,
            favorito: favNorm,
          };
        });

        setAllProjects(mapped);
        setTotalRows(res.TotalRows);
      } catch (err) {
        console.error("Error cargando Expedientes desde Search API:", err);
      } finally {
        setIsLoadingProjects(false);
      }
    };

    void loadProjects();
  }, [
    context,
    search,
    clienteFilter,
    estadoFilter,
    juridicaFilter,
    startDateFilter,
    endDateFilter,
    pageSize,
    page,
  ]);

  // Debounce para el input de búsqueda
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectSelected = params.get("projects");
    // Si projects=my -> solo mis expedientes; en cualquier otro caso -> todos
    setMyProyectsIsSelected(projectSelected === "my");
  }, []);

  const hasActiveFilters =
    !!search ||
    !!clienteFilter ||
    !!estadoFilter ||
    !!juridicaFilter ||
    !!startDateFilter ||
    !!endDateFilter;

  return (
    <div className={styles.container}>
      <div className={styles.column}>
        <div className={styles.card}>
          <div className={styles.containerHeader}>
            <h2>
              {myProyectsIsSelected
                ? "Mis expedientes"
                : "Todos los expedientes"}
            </h2>
            <div className={styles.containerButton}>
              {canAddProject && (
                <a
                  href={`${absolutePath}/SitePages/alta-proyecto.aspx`}
                  className={styles.btnSearch}
                >
                  Agregar
                </a>
              )}
              <a
                className={styles.btnSearch}
                href={`${absolutePath}/SitePages/buscador-avanzado.aspx`}
              >
                Buscador avanzado
              </a>
            </div>
          </div>

          <div className={styles.searchBar}>
            <input
              placeholder="Buscar por ID, título o nemotécnico"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className={styles.filtersRow}>
            <div className={styles.field}>
              <label>Cliente</label>
              <select
                value={clienteFilter}
                onChange={(e) => {
                  setClienteFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {uniqueClientes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label>Jurídica</label>
              <select
                value={juridicaFilter}
                onChange={(e) => {
                  setJuridicaFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas</option>
                {uniqueJuridicas.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label>Estado</label>
              <select
                value={estadoFilter}
                onChange={(e) => {
                  setEstadoFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {uniqueEstados.map((est) => (
                  <option key={est} value={est}>
                    {est}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Fecha inicio (contrato)</label>
              <DatePicker
                firstDayOfWeek={DayOfWeek.Monday}
                value={startDateFilter}
                formatDate={getFormatDate}
                onSelectDate={(date) => {
                  setStartDateFilter(date || undefined);
                  setPage(1);
                }}
                label={""}
                className={styles.datePicker}
              />
            </div>

            <div>
              <label>Fecha fin (contrato)</label>
              <DatePicker
                firstDayOfWeek={DayOfWeek.Monday}
                value={endDateFilter}
                formatDate={getFormatDate}
                onSelectDate={(date) => {
                  setEndDateFilter(date || undefined);
                  setPage(1);
                }}
                label={""}
                className={styles.datePicker}
              />
            </div>

            <button
              className={styles.btnSearch}
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setClienteFilter("");
                setJuridicaFilter("");
                setEstadoFilter("");
                setStartDateFilter(undefined);
                setEndDateFilter(undefined);
                setPage(1);
              }}
            >
              Limpiar filtros
            </button>
          </div>

          {isLoadingProjects ? (
            <table>
              <tbody>
                <tr>
                  <td colSpan={9}>
                    <div className={styles.loadingRow}>
                      <div className={styles.loadingSpinner} />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : projects.length === 0 ? (
            <div className={styles.emptyState}>
              {hasActiveFilters ? (
                <>
                  <h3>
                    No se han encontrado expedientes con los filtros aplicados
                  </h3>
                  <p>
                    No hay expedientes que cumplan los criterios actuales.
                    Ajusta los filtros o utiliza el botón{" "}
                    <strong>Limpiar filtros</strong> para volver a ver el
                    listado completo.
                  </p>
                </>
              ) : myProyectsIsSelected ? (
                <>
                  <h3>No tienes expedientes asociados</h3>
                  <p>
                    Todavía no aparece ningún expediente vinculado a tu usuario.
                    Cuando te asignen un rol en un expediente, se mostrará aquí
                    en <strong>Mis expedientes</strong>.
                  </p>
                </>
              ) : (
                <>
                  <h3>No hay expedientes disponibles</h3>
                  <p>
                    Todavía no se ha registrado ningún expediente en el portal.
                    {canAddProject ? (
                      <>
                        {" "}
                        Utiliza el botón <strong>Agregar</strong> para
                        aprovisionar el primero.
                      </>
                    ) : null}
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>ID Expediente</th>
                    <th>Título</th>
                    <th>Nemotécnico</th>
                    <th>Fecha inicio</th>
                    <th>Fecha fin</th>
                    <th>Estado</th>
                    <th>Cliente</th>
                    <th>Jurídica</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.nemotecnico}>
                      <td>{p.idexpediente}</td>
                      <td>
                        <a
                          className={styles.projectName}
                          href={`${absolutePath}/SitePages/detalle-proyecto.aspx?proyectoid=${p.idexpediente}`}
                        >
                          {p.title}
                        </a>
                      </td>
                      <td>{p.nemotecnico}</td>
                      <td>{formatDateDisplay(p.startDate)}</td>
                      <td>{formatDateDisplay(p.endDate)}</td>
                      <td>{p.estado}</td>
                      <td>{p.cliente}</td>
                      <td>
                        <div className={styles.juridicaCell}>
                          {p.juridicaList.length ? (
                            p.juridicaList.map((name) => (
                              <span
                                key={name}
                                className={styles.juridicaTag}
                                title={name}
                              >
                                {name}
                              </span>
                            ))
                          ) : (
                            <span className={styles.juridicaEmpty}>
                              Sin datos
                            </span>
                          )}
                        </div>
                      </td>
                      <td onClick={() => void handleFavorite(p)}>
                        <img
                          src={`${absolutePath}/${_urlAssets}/${p.favorito ? "star.svg" : "star-empty.svg"}`}
                          alt=""
                          className={styles.favoriteIcon}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={page}
                setPage={setPage}
                totalPages={totalPages}
              />
            </>
          )}
        </div>
        {/* <div className={styles.card}>
          <ProjectCharts projects={filteredAndSorted} />
        </div> */}
      </div>
    </div>
  );
};

export default ProyectList;
