// @ts-nocheck
import * as React from "react";
import Pagination from "../pagination/Pagination";
import { ITaskProps } from "./ITaskListProps";
import styles from "./TaskList.module.scss";
import { sp } from "@pnp/sp";
import { DatePicker, DayOfWeek } from "office-ui-fabric-react";
import { PeoplePicker } from "../peoplePicker/PeoplePicker";
import { IPersonaProps } from "@fluentui/react/lib/Persona";

const DEFAULT_ITEMS_PER_PAGE = 10;
const EMPTY_FORCED_ESTADOS: string[] = [];
const EMPTY_PROJECT_IDS: number[] = [];

/** Etiquetas de estado en Mis flujos (valor SP → texto UI). */
const FLOW_ESTADO_LABELS: Record<string, string> = {
  EnRevision: "En evaluación",
  EnFirma: "En firma",
};

const getEstadoDisplayLabel = (estado: string): string => {
  const raw = String(estado || "").trim();
  if (!raw) return "";
  return FLOW_ESTADO_LABELS[raw] || raw;
};

interface ITaskRow {
  taskid: number;
  title: string;
  idProyecto?: number;
  nemotecnico?: string;
  codExp?: string;
  startDate: string;
  endDate: string;
  estado: string;
  responsable: string;
  idTipo?: number;
  deadlineDate: string;
  elaborador: string;
  nextAprobador?: string;
  firmantesList?: string[];
  startRaw?: Date;
  endRaw?: Date;
  deadlineRaw?: Date;
}

interface IExpedienteLookup {
  nemotecnico: string;
  codExp: string;
}

/**
 * JOIN a Expedientes por IDExpediente → Nemotecnico + CodExp.
 * Consulta solo los IDs de la página actual.
 */
const loadExpedientesLookupByIds = async (
  idExpedientes: number[],
): Promise<Map<number, IExpedienteLookup>> => {
  const map = new Map<number, IExpedienteLookup>();
  const uniqueIds = Array.from(
    new Set(idExpedientes.filter((id) => Number.isFinite(id) && id > 0)),
  );
  if (!uniqueIds.length) return map;

  const CHUNK = 30;
  const list = sp.web.lists.getByTitle("Expedientes");
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK);
    const filter = chunk.map((id) => `IDExpediente eq ${id}`).join(" or ");
    try {
      const items: any[] = await list.items
        .filter(filter)
        .select("IDExpediente", "Nemotecnico", "CodExp")
        .top(chunk.length)
        .get();
      items.forEach((exp) => {
        const id = Number(exp.IDExpediente);
        if (!Number.isFinite(id) || id <= 0) return;
        map.set(id, {
          nemotecnico: String(exp.Nemotecnico || "").trim(),
          codExp: String(exp.CodExp || "").trim(),
        });
      });
    } catch (e) {
      console.warn(
        "No se pudieron cargar Nemotecnico/CodExp de Expedientes:",
        chunk,
        e,
      );
    }
  }
  return map;
};

const formatDate = (value?: string): string => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES");
};

const escapeODataValue = (value: string): string => value.replace(/'/g, "''");

const toODataDateTime = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T00:00:00Z`;
};

const getFormatDate = (date?: Date | null): string => {
  if (!date) return "";

  const dd = date.getDate();
  const mm = date.getMonth() + 1; // Enero es 0
  const yyyy = date.getFullYear();

  const ddStr = dd < 10 ? `0${dd}` : `${dd}`;
  const mmStr = mm < 10 ? `0${mm}` : `${mm}`;

  return `${ddStr}/${mmStr}/${yyyy}`;
};

const normalizeText = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const isMyTasksUserOnTask = (
  responsable: unknown,
  elaborador: unknown,
  userNorm: string,
): boolean => {
  if (!userNorm) return false;
  if (normalizeText(responsable) === userNorm) return true;
  const elaboradorNorm = normalizeText(elaborador);
  if (!elaboradorNorm) return false;
  if (elaboradorNorm.indexOf(userNorm) >= 0) return true;
  return elaboradorNorm
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => part === userNorm || part.indexOf(userNorm) >= 0);
};

/** IDs de tarea relacionados al usuario (nombre sin tildes / case-insensitive). */
const loadMyTasksRelatedTaskIds = async (
  userName: string,
  projectIds: number[],
): Promise<number[]> => {
  const userNorm = normalizeText(userName);
  if (!userNorm || projectIds.length === 0) return [];

  const projectOr = projectIds.map((id) => `IDProyecto eq ${id}`).join(" or ");
  const projectTasks: any[] = await sp.web.lists
    .getByTitle("TareasDocumentales")
    .items.filter(`(${projectOr})`)
    .select("IDTarea", "Responsable", "Elaborador")
    .top(5000)
    .getAll();

  const relatedTaskIdsMap: Record<number, boolean> = {};
  const relatedTaskIds: number[] = [];
  const addTaskId = (value: unknown): void => {
    const id = Number(value);
    if (!isFinite(id) || id <= 0 || relatedTaskIdsMap[id]) return;
    relatedTaskIdsMap[id] = true;
    relatedTaskIds.push(id);
  };

  projectTasks.forEach((row) => {
    if (isMyTasksUserOnTask(row?.Responsable, row?.Elaborador, userNorm)) {
      addTaskId(row?.IDTarea);
    }
  });

  const revisionesRaw: any[] = await sp.web.lists
    .getByTitle("Revisiones")
    .items.select("IDTareaDocumental", "Title")
    .top(5000)
    .getAll();
  revisionesRaw.forEach((r) => {
    if (normalizeText(r?.Title) === userNorm) {
      addTaskId(r?.IDTareaDocumental);
    }
  });

  const firmasRaw: any[] = await sp.web.lists
    .getByTitle("Firmas")
    .items.select("IDTareaDocumental", "Title")
    .top(5000)
    .getAll();
  firmasRaw.forEach((f) => {
    if (normalizeText(f?.Title) === userNorm) {
      addTaskId(f?.IDTareaDocumental);
    }
  });

  return relatedTaskIds;
};

const DEFAULT_ID_TIPO_EXPEDIENTE = 1;

interface IGrupoDocumentoOption {
  idCarpeta: number;
  title: string;
}

interface ITipoDocumentoOption {
  Id: number;
  Title: string;
}

interface ICarpetaExpedienteItem {
  idCarpeta: number;
  title: string;
  idPadre: unknown;
}

const parseSharePointNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value !== null && "Id" in value) {
    return parseSharePointNumber((value as { Id?: unknown }).Id);
  }
  const parsed = Number(String(value).trim().replace(",", "."));
  return isNaN(parsed) ? null : parsed;
};

const isIdPadreEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "object") return false;
  const raw = String(value).trim();
  return !raw || raw === "0";
};

const mapCarpetaExpedienteItem = (item: any): ICarpetaExpedienteItem | null => {
  const idCarpeta = parseSharePointNumber(item?.IDCarpeta ?? item?.Id);
  const title = String(item?.Title || "").trim();
  if (idCarpeta === null || !title) return null;
  return {
    idCarpeta,
    title,
    idPadre: item?.IDPadre,
  };
};

/** Misma condición que TaskDetail: deadline anterior a hoy. */
const isPastDisplayDate = (value?: string): boolean => {
  const raw = String(value || "").trim();
  if (!raw) return false;

  const parts = raw.split("/");
  if (parts.length !== 3) return false;

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (!day || !month || !year) return false;

  const deadlineDate = new Date(year, month - 1, day);
  if (isNaN(deadlineDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadlineDate.setHours(0, 0, 0, 0);

  return deadlineDate < today;
};

const TaskList: React.FC<ITaskProps> = ({
  context,
  projectId,
  projectIds = EMPTY_PROJECT_IDS,
  itemsPerPage,
  listTitle = "Listado de tareas",
  myTasksUserName = "",
  myFlowsUserName = "",
  forcedEstados = EMPTY_FORCED_ESTADOS,
  showFlowColumns = false,
  displayTitle = true,
}) => {
  const isMyTasksMode = !!String(myTasksUserName || "").trim();
  const isMyFlowsMode = !!String(myFlowsUserName || "").trim();
  /** Nemotécnico / Nº corto / Tipo: Mis tareas y Mis flujos. */
  const showExpedienteColumns = isMyTasksMode || isMyFlowsMode;
  /** Mis flujos no muestra Elaboradores. */
  const showElaboradoresColumn = !isMyFlowsMode;
  /** Filtro de estado visible en listado normal y en Mis flujos. */
  const showEstadoFilter = !showFlowColumns || isMyFlowsMode;
  const absolutePath = context.pageContext.web.absoluteUrl;
  const pageSize =
    typeof itemsPerPage === "number" && itemsPerPage > 0
      ? itemsPerPage
      : DEFAULT_ITEMS_PER_PAGE;
  const [page, setPage] = React.useState(1);
  const [tasks, setTasks] = React.useState<ITaskRow[]>([]);
  const [estadoFilter, setEstadoFilter] = React.useState<string>("");
  const [estadoOptions, setEstadoOptions] = React.useState<string[]>([]);
  const [tipoFilter, setTipoFilter] = React.useState<string>("");
  const [grupoFilter, setGrupoFilter] = React.useState<string>("");
  const [tiposDocumento, setTiposDocumento] = React.useState<
    ITipoDocumentoOption[]
  >([]);
  const [tiposDocumentoFiltrados, setTiposDocumentoFiltrados] = React.useState<
    ITipoDocumentoOption[]
  >([]);
  const [gruposDocumento, setGruposDocumento] = React.useState<
    IGrupoDocumentoOption[]
  >([]);
  const [loadingGruposDocumento, setLoadingGruposDocumento] =
    React.useState(false);
  const [loadingTiposDocumento, setLoadingTiposDocumento] =
    React.useState(false);
  const [expedienteInfo, setExpedienteInfo] = React.useState<{
    id: number;
    title: string;
  } | null>(null);
  const [titleFilter, setTitleFilter] = React.useState<string>("");
  const [titleInput, setTitleInput] = React.useState<string>("");
  const [nemotecnicoFilter, setNemotecnicoFilter] = React.useState<string>("");
  const [nemotecnicoInput, setNemotecnicoInput] = React.useState<string>("");
  const [codExpFilter, setCodExpFilter] = React.useState<string>("");
  const [codExpInput, setCodExpInput] = React.useState<string>("");
  const [startFrom, setStartFrom] = React.useState<Date | undefined>();
  const [startTo, setStartTo] = React.useState<Date | undefined>();
  const [endFrom, setEndFrom] = React.useState<Date | undefined>();
  const [endTo, setEndTo] = React.useState<Date | undefined>();
  const [deadlineFrom, setDeadlineFrom] = React.useState<Date | undefined>();
  const [deadlineTo, setDeadlineTo] = React.useState<Date | undefined>();
  const [elaboradoresFilter, setElaboradoresFilter] = React.useState<string[]>(
    [],
  );
  const [responsablesFilter, setResponsablesFilter] = React.useState<string[]>(
    [],
  );
  const [showFilters, setShowFilters] = React.useState<boolean>(false);
  const [canCreateTask, setCanCreateTask] = React.useState<boolean>(false);
  const [sortField, setSortField] = React.useState<
    "start" | "end" | "deadline"
  >("start");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(
    "desc",
  );
  const [totalRows, setTotalRows] = React.useState<number>(0);
  const [isLoadingTasks, setIsLoadingTasks] = React.useState<boolean>(false);
  const normalizedProjectIds = React.useMemo(() => {
    const fromProp = (projectIds || [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (fromProp.length > 0) {
      return Array.from(new Set(fromProp));
    }

    const projectNum = Number(projectId);
    if (Number.isFinite(projectNum) && projectNum > 0) {
      return [projectNum];
    }
    return [];
  }, [projectId, projectIds]);
  const singleProjectId =
    normalizedProjectIds.length === 1 ? normalizedProjectIds[0] : null;

  const hasActiveFilters =
    !!titleFilter ||
    !!nemotecnicoFilter ||
    !!codExpFilter ||
    !!estadoFilter ||
    !!grupoFilter ||
    !!tipoFilter ||
    !!startFrom ||
    !!startTo ||
    !!endFrom ||
    !!endTo ||
    !!deadlineFrom ||
    !!deadlineTo ||
    elaboradoresFilter.length > 0 ||
    responsablesFilter.length > 0;

  const tiposDocumentoOptions = grupoFilter
    ? tiposDocumentoFiltrados
    : [];

  const loadTiposDocumentoPorCarpeta = React.useCallback(
    async (
      idCarpeta: number,
      catalog?: ITipoDocumentoOption[],
    ): Promise<ITipoDocumentoOption[]> => {
      try {
        setLoadingTiposDocumento(true);
        const links: any[] = await sp.web.lists
          .getByTitle("TipoDocumento_plantilla")
          .items.filter(`IDCarpeta eq ${idCarpeta}`)
          .select("IDTipoDocumento")
          .top(5000)
          .getAll();

        const idSet = new Set<number>();
        links.forEach((link) => {
          const idTipo = parseSharePointNumber(link.IDTipoDocumento);
          if (idTipo !== null) idSet.add(idTipo);
        });

        const source = catalog ?? tiposDocumento;
        const filtrados = source.filter((t) => idSet.has(t.Id));
        setTiposDocumentoFiltrados(filtrados);
        return filtrados;
      } catch (err) {
        console.error(
          "Error cargando tipos de documento desde TipoDocumento_plantilla:",
          err,
        );
        setTiposDocumentoFiltrados([]);
        return [];
      } finally {
        setLoadingTiposDocumento(false);
      }
    },
    [tiposDocumento],
  );

  const cargarGruposDocumento = React.useCallback(
    async (idTipoExpediente: number): Promise<IGrupoDocumentoOption[]> => {
      try {
        setLoadingGruposDocumento(true);
        const items: any[] = await sp.web.lists
          .getByTitle("CarpetaExpediente")
          .items.filter(`IDTipoExpediente eq ${idTipoExpediente}`)
          .select("IDCarpeta", "Title", "IDPadre")
          .top(5000)
          .getAll();

        const catalog = items
          .map(mapCarpetaExpedienteItem)
          .filter((entry): entry is ICarpetaExpedienteItem => entry !== null);

        const mapped = catalog
          .filter((entry) => !isIdPadreEmpty(entry.idPadre))
          .map(({ idCarpeta, title }) => ({ idCarpeta, title }));

        setGruposDocumento(mapped);
        return mapped;
      } catch (err) {
        console.error(
          "Error cargando grupos de documento desde CarpetaExpediente:",
          err,
        );
        setGruposDocumento([]);
        return [];
      } finally {
        setLoadingGruposDocumento(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  React.useEffect(() => {
    let isMounted = true;

    const loadCreatePermission = async (): Promise<void> => {
      if (showFlowColumns || singleProjectId === null) {
        if (isMounted) setCanCreateTask(false);
        return;
      }

      try {
        const currentUserName = normalizeText(
          context.pageContext.user.displayName || "",
        );
        const currentUserEmail = normalizeText(
          context.pageContext.user.email || "",
        );

        let hasPermissionByRoles = false;
        if (singleProjectId !== null && (currentUserName || currentUserEmail)) {
          const allowedRoles = new Set(
            [
              "Preventa",
              "Jefe de Proyecto",
              "Técnicos de calidad",
              "Técnicos de documentación",
            ].map((r) => normalizeText(r)),
          );

          const rolesCatalog: Array<{ IDRol?: number | string; Title?: string }> =
            await sp.web.lists
              .getByTitle("Roles")
              .items.select("IDRol", "Title")
              .top(5000)
              .getAll();

          const allowedRoleIds = rolesCatalog
            .filter((r) => allowedRoles.has(normalizeText(r.Title || "")))
            .map((r) => Number(r.IDRol))
            .filter((id) => Number.isFinite(id));

          if (allowedRoleIds.length > 0) {
            const roleFilter = allowedRoleIds
              .map((id) => `IDRol eq ${id}`)
              .join(" or ");
            const rolesUsuarioFilter = `IDExpediente eq ${singleProjectId} and (${roleFilter})`;

            const rolesUsuario: Array<{
              Title?: string;
              usuario?: unknown;
            }> = await sp.web.lists
              .getByTitle("Roles_usuario")
              .items.filter(rolesUsuarioFilter)
              .select("Title", "usuario")
              .top(5000)
              .getAll();

            hasPermissionByRoles = rolesUsuario.some((item) => {
              const byTitle = normalizeText(item.Title || "") === currentUserName;
              const usuarioRaw = String(item.usuario || "");
              const byEmail =
                !!currentUserEmail &&
                normalizeText(usuarioRaw).indexOf(currentUserEmail) >= 0;
              return byTitle || byEmail;
            });
          }
        }

        const allowedGroupNames = ["calidad", "documentacion"];
        const currentUserGroups: Array<{ Title?: string }> =
          await sp.web.currentUser.groups.select("Title").get();
        const hasPermissionByGroup = currentUserGroups.some((group) => {
          const normalizedGroupName = normalizeText(group.Title || "");
          return allowedGroupNames.some(
            (allowed) =>
              normalizedGroupName === allowed ||
              normalizedGroupName.indexOf(allowed) >= 0,
          );
        });
        const hasPermission = hasPermissionByRoles;

        if (isMounted) setCanCreateTask(hasPermission);
      } catch (err) {
        console.error("Error validando permisos para agregar tarea:", err);
        if (isMounted) setCanCreateTask(false);
      }
    };

    void loadCreatePermission();
    return () => {
      isMounted = false;
    };
  }, [context, showFlowColumns, singleProjectId]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setTitleFilter(titleInput);
      setPage(1);
    }, 400);

    return () => clearTimeout(timer);
  }, [titleInput]);

  React.useEffect(() => {
    if (!showExpedienteColumns) return;
    const timer = setTimeout(() => {
      setNemotecnicoFilter(nemotecnicoInput);
      setCodExpFilter(codExpInput);
      setPage(1);
    }, 400);

    return () => clearTimeout(timer);
  }, [nemotecnicoInput, codExpInput, showExpedienteColumns]);

  const loadPendingFlowTaskIdsForUser = React.useCallback(
    async (userName: string): Promise<number[]> => {
      const normalizedUser = normalizeText(userName);
      if (!normalizedUser) return [];

      const revisionesRaw: any[] = await sp.web.lists
        .getByTitle("Revisiones")
        .items.filter(`EstadoRevision eq 'Pendiente'`)
        .select("IDTareaDocumental", "Title")
        .top(5000)
        .getAll();

      const taskIdsMap: Record<number, boolean> = {};
      const flowTaskIds: number[] = [];
      const addTaskId = (value: unknown): void => {
        const id = Number(value);
        if (!isFinite(id) || id <= 0 || taskIdsMap[id]) return;
        taskIdsMap[id] = true;
        flowTaskIds.push(id);
      };

      revisionesRaw.forEach((rev) => {
        if (normalizeText(rev?.Title) !== normalizedUser) return;
        addTaskId(rev?.IDTareaDocumental);
      });

      const firmasRaw: any[] = await sp.web.lists
        .getByTitle("Firmas")
        .items.filter(`EstadoFirma eq 'Pendiente'`)
        .select("IDTareaDocumental", "Title")
        .top(5000)
        .getAll();

      firmasRaw.forEach((firma) => {
        if (normalizeText(firma?.Title) !== normalizedUser) return;
        addTaskId(firma?.IDTareaDocumental);
      });

      return flowTaskIds;
    },
    [],
  );

  React.useEffect(() => {
    const loadTasks = async () => {
      try {
        setIsLoadingTasks(true);
        if (normalizedProjectIds.length === 0) {
          setTasks([]);
          setTotalRows(0);
          return;
        }

        const projectOr = normalizedProjectIds
          .map((id) => `IDProyecto eq ${id}`)
          .join(" or ");
        const filterParts: string[] = [`(${projectOr})`];
        const myTasksUser = String(myTasksUserName || "").trim();
        if (myTasksUser) {
          const relatedTaskIds = await loadMyTasksRelatedTaskIds(
            myTasksUser,
            normalizedProjectIds,
          );
          if (relatedTaskIds.length === 0) {
            filterParts.push(`IDTarea eq -1`);
          } else {
            filterParts.push(
              `(${relatedTaskIds.map((id) => `IDTarea eq ${id}`).join(" or ")})`,
            );
          }
        }
        const myFlowsUser = String(myFlowsUserName || "").trim();
        if (myFlowsUser) {
          const flowTaskIds = await loadPendingFlowTaskIdsForUser(myFlowsUser);
          if (flowTaskIds.length === 0) {
            filterParts.push(`IDTarea eq -1`);
          } else {
            filterParts.push(
              `(${flowTaskIds.map((id) => `IDTarea eq ${id}`).join(" or ")})`,
            );
          }
        }

        const searchNorm = titleFilter.trim();
        if (searchNorm) {
          const escapedSearch = escapeODataValue(searchNorm);
          const isNumeric = /^[0-9]+$/.test(searchNorm);
          if (isNumeric) {
            filterParts.push(
              `(substringof('${escapedSearch}', Title) or IDTarea eq ${Number(searchNorm)})`,
            );
          } else {
            filterParts.push(`substringof('${escapedSearch}', Title)`);
          }
        }

        if (showExpedienteColumns) {
          const nemotecnicoNorm = nemotecnicoFilter.trim();
          if (nemotecnicoNorm) {
            filterParts.push(
              `substringof('${escapeODataValue(nemotecnicoNorm)}', Nemotecnico)`,
            );
          }
          const codExpNorm = codExpFilter.trim();
          if (codExpNorm) {
            filterParts.push(
              `substringof('${escapeODataValue(codExpNorm)}', CodExp)`,
            );
          }
        }

        if (estadoFilter) {
          filterParts.push(
            `EstadoTarea eq '${escapeODataValue(estadoFilter)}'`,
          );
        }

        if (forcedEstados.length > 0) {
          const estadoOr = forcedEstados
            .map((estado) => String(estado || "").trim())
            .filter(Boolean)
            .map((estado) => `EstadoTarea eq '${escapeODataValue(estado)}'`)
            .join(" or ");
          if (estadoOr) {
            filterParts.push(`(${estadoOr})`);
          }
        }

        if (tipoFilter) {
          const tipoNum = Number(tipoFilter);
          if (!Number.isNaN(tipoNum)) {
            filterParts.push(`IDTipo eq ${tipoNum}`);
          }
        } else if (grupoFilter && tiposDocumentoFiltrados.length > 0) {
          const tipoOr = tiposDocumentoFiltrados
            .map((t) => Number(t.Id))
            .filter((id) => Number.isFinite(id) && id > 0)
            .map((id) => `IDTipo eq ${id}`)
            .join(" or ");
          if (tipoOr) {
            filterParts.push(`(${tipoOr})`);
          }
        } else if (grupoFilter) {
          // Grupo seleccionado sin tipos asociados: no devolver resultados.
          filterParts.push(`IDTarea eq -1`);
        }

        if (responsablesFilter.length > 0) {
          const respOr = responsablesFilter
            .map((r) => String(r || "").trim())
            .filter(Boolean)
            .map((r) => `Responsable eq '${escapeODataValue(r)}'`)
            .join(" or ");
          if (respOr) {
            filterParts.push(`(${respOr})`);
          }
        }

        if (elaboradoresFilter.length > 0) {
          const elabOr = elaboradoresFilter
            .map((e) => String(e || "").trim())
            .filter(Boolean)
            .map((e) => `substringof('${escapeODataValue(e)}', Elaborador)`)
            .join(" or ");
          if (elabOr) {
            filterParts.push(`(${elabOr})`);
          }
        }

        if (startFrom) {
          filterParts.push(
            `FechaInicioTarea ge datetime'${toODataDateTime(startFrom)}'`,
          );
        }
        if (startTo) {
          filterParts.push(
            `FechaInicioTarea le datetime'${toODataDateTime(startTo)}'`,
          );
        }
        if (endFrom) {
          filterParts.push(
            `FechaFinTarea ge datetime'${toODataDateTime(endFrom)}'`,
          );
        }
        if (endTo) {
          filterParts.push(
            `FechaFinTarea le datetime'${toODataDateTime(endTo)}'`,
          );
        }
        if (deadlineFrom) {
          filterParts.push(
            `FechaDeadline ge datetime'${toODataDateTime(deadlineFrom)}'`,
          );
        }
        if (deadlineTo) {
          filterParts.push(
            `FechaDeadline le datetime'${toODataDateTime(deadlineTo)}'`,
          );
        }

        const odataFilter = filterParts.join(" and ");
        const sortFieldMap: Record<"start" | "end" | "deadline", string> = {
          start: "FechaInicioTarea",
          end: "FechaFinTarea",
          deadline: "FechaDeadline",
        };
        const sortColumn = sortFieldMap[sortField];
        const sortAsc = sortDirection === "asc";

        // Total real del filtro (solo IDs) + página actual con getPaged.
        // SharePoint REST ignora $skip en listas; no se puede paginar con skip.
        const listItems = sp.web.lists.getByTitle("TareasDocumentales").items;
        const countPromise = listItems
          .filter(odataFilter)
          .select("ID")
          .top(5000)
          .getAll();

        const baseItemsQuery = listItems
          .filter(odataFilter)
          .select(
            "IDTarea",
            "IDProyecto",
            "Title",
            "FechaInicioTarea",
            "FechaFinTarea",
            "FechaDeadline",
            "EstadoTarea",
            "Responsable",
            "IDTipo",
            "Elaborador",
            "ListaFirmantes",
            "Nemotecnico",
            "CodExp",
          )
          .orderBy(sortColumn, sortAsc)
          .orderBy("IDTarea", true)
          .top(pageSize);

        let paged = await baseItemsQuery.getPaged();
        for (let i = 1; i < page; i++) {
          if (!paged.hasNext) {
            paged = { results: [] } as typeof paged;
            break;
          }
          paged = await paged.getNext();
        }

        const countItems: any[] = await countPromise;
        setTotalRows(countItems.length);

        const pagedItems: any[] = Array.isArray(paged.results)
          ? (paged.results as any[])
          : [];

        let rows: ITaskRow[] = pagedItems.map((it) => {
          const startRaw = it.FechaInicioTarea
            ? new Date(it.FechaInicioTarea as string)
            : undefined;
          const endRaw = it.FechaFinTarea
            ? new Date(it.FechaFinTarea as string)
            : undefined;
          const deadlineRaw = it.FechaDeadline
            ? new Date(it.FechaDeadline as string)
            : undefined;
          const firmantesList = String(it.ListaFirmantes || "")
            .split(/[;\r\n,]+/)
            .map((name) => String(name || "").trim())
            .filter(Boolean);

          return {
            taskid: Number(it.IDTarea) || 0,
            title: (it.Title as string) || "",
            idProyecto:
              it.IDProyecto !== null && it.IDProyecto !== undefined
                ? Number(it.IDProyecto)
                : undefined,
            nemotecnico: String(it.Nemotecnico || "").trim(),
            codExp: String(it.CodExp || "").trim(),
            startDate: formatDate(it.FechaInicioTarea as string),
            endDate: formatDate(it.FechaFinTarea as string),
            estado: (it.EstadoTarea as string) || "",
            responsable: (it.Responsable as string) || "",
            idTipo:
              it.IDTipo !== null && it.IDTipo !== undefined
                ? Number(it.IDTipo)
                : undefined,
            deadlineDate: formatDate(it.FechaDeadline as string),
            elaborador: (it.Elaborador as string) || "",
            firmantesList,
            startRaw,
            endRaw,
            deadlineRaw,
          };
        });

        // Completar Nemotecnico/CodExp desde Expedientes si faltan en la tarea.
        if (showExpedienteColumns && rows.length > 0) {
          try {
            const expIds = rows
              .map((r) => Number(r.idProyecto))
              .filter((id) => Number.isFinite(id) && id > 0);
            const lookup = await loadExpedientesLookupByIds(expIds);
            rows = rows.map((row) => {
              const id = Number(row.idProyecto);
              const info =
                Number.isFinite(id) && id > 0 ? lookup.get(id) : undefined;
              return {
                ...row,
                nemotecnico: row.nemotecnico || info?.nemotecnico || "",
                codExp: row.codExp || info?.codExp || "",
              };
            });
          } catch (e) {
            console.warn(
              "No se pudo enriquecer tareas con Expedientes (Nemotecnico/CodExp):",
              e,
            );
          }
        }

        if (showFlowColumns && rows.length > 0) {
          const taskIds = rows
            .map((row) => row.taskid)
            .filter((id) => Number.isFinite(id) && id > 0);
          const taskIdsSet = new Set(taskIds);
          const revisionesPendientes: any[] = await sp.web.lists
            .getByTitle("Revisiones")
            .items.filter(`EstadoRevision eq 'Pendiente'`)
            .select("IDTareaDocumental", "Title")
            .top(pageSize * 4)
            .getAll();

          const pendingByTask = new Map<number, string[]>();
          revisionesPendientes.forEach((rev) => {
            const taskNum = Number(rev.IDTareaDocumental);
            if (!taskIdsSet.has(taskNum)) return;
            const title = String(rev.Title || "").trim();
            if (!title) return;
            const current = pendingByTask.get(taskNum) || [];
            if (current.indexOf(title) < 0) {
              current.push(title);
              pendingByTask.set(taskNum, current);
            }
          });

          const rowsWithFlow = rows.map((row) => ({
            ...row,
            nextAprobador: (pendingByTask.get(row.taskid) || []).join(" · "),
          }));
          setTasks(rowsWithFlow);
        } else {
          setTasks(rows);
        }
      } catch (error) {
        console.error("Error cargando tareas desde Query API:", error);
        setTasks([]);
        setTotalRows(0);
      } finally {
        setIsLoadingTasks(false);
      }
    };

    void loadTasks();
  }, [
    page,
    pageSize,
    titleFilter,
    nemotecnicoFilter,
    codExpFilter,
    estadoFilter,
    tipoFilter,
    grupoFilter,
    tiposDocumentoFiltrados,
    startFrom,
    startTo,
    endFrom,
    endTo,
    deadlineFrom,
    deadlineTo,
    elaboradoresFilter,
    responsablesFilter,
    sortField,
    sortDirection,
    forcedEstados,
    showFlowColumns,
    showExpedienteColumns,
    normalizedProjectIds,
    myTasksUserName,
    myFlowsUserName,
    loadPendingFlowTaskIdsForUser,
  ]);

  const projectScopeKey = React.useMemo(
    () => normalizedProjectIds.join(","),
    [normalizedProjectIds],
  );
  const forcedEstadosKey = React.useMemo(
    () =>
      (forcedEstados || [])
        .map((estado) => String(estado || "").trim())
        .filter(Boolean)
        .join("|"),
    [forcedEstados],
  );

  React.useEffect(() => {
    const loadEstadoOptions = async () => {
      const forced = (forcedEstados || [])
        .map((estado) => String(estado || "").trim())
        .filter(Boolean);
      if (forced.length > 0) {
        setEstadoOptions(Array.from(new Set(forced)));
        return;
      }

      if (normalizedProjectIds.length === 0) {
        setEstadoOptions([]);
        return;
      }

      try {
        const projectOr = normalizedProjectIds
          .map((id) => `IDProyecto eq ${id}`)
          .join(" or ");
        const filterParts: string[] = [`(${projectOr})`];

        const myTasksUser = String(myTasksUserName || "").trim();
        if (myTasksUser) {
          const relatedTaskIds = await loadMyTasksRelatedTaskIds(
            myTasksUser,
            normalizedProjectIds,
          );
          if (relatedTaskIds.length === 0) {
            filterParts.push(`IDTarea eq -1`);
          } else {
            filterParts.push(
              `(${relatedTaskIds.map((id) => `IDTarea eq ${id}`).join(" or ")})`,
            );
          }
        }

        const myFlowsUser = String(myFlowsUserName || "").trim();
        if (myFlowsUser) {
          const flowTaskIds = await loadPendingFlowTaskIdsForUser(myFlowsUser);
          if (flowTaskIds.length === 0) {
            filterParts.push(`IDTarea eq -1`);
          } else {
            filterParts.push(
              `(${flowTaskIds.map((id) => `IDTarea eq ${id}`).join(" or ")})`,
            );
          }
        }

        const items: any[] = await sp.web.lists
          .getByTitle("TareasDocumentales")
          .items.filter(filterParts.join(" and "))
          .select("EstadoTarea")
          .top(5000)
          .getAll();

        const values = new Set<string>();
        items.forEach((it) => {
          const estado = String(it?.EstadoTarea || "").trim();
          if (estado) values.add(estado);
        });
        setEstadoOptions(
          Array.from(values).sort((a, b) => a.localeCompare(b, "es")),
        );
      } catch (e) {
        console.error("Error cargando opciones de estado:", e);
        setEstadoOptions([]);
      }
    };

    void loadEstadoOptions();
  }, [
    projectScopeKey,
    forcedEstadosKey,
    myTasksUserName,
    myFlowsUserName,
    forcedEstados,
    normalizedProjectIds,
    loadPendingFlowTaskIdsForUser,
  ]);

  React.useEffect(() => {
    const loadExpediente = async () => {
      try {
        if (singleProjectId === null) {
          setExpedienteInfo(null);
          return;
        }

        const items: any[] = await sp.web.lists
          .getByTitle("Expedientes")
          .items.filter(`IDExpediente eq ${singleProjectId}`)
          .select(
            "IDExpediente",
            "Title",
            "Nemotecnico",
            "IDTipoExpediente",
          )
          .top(1)
          .get();
        if (items.length) {
          setExpedienteInfo({
            id: `${items[0].IDExpediente} - ${items[0].Nemotecnico}` as string,
            title: (items[0].Title as string) || "",
          });
        } else {
          setExpedienteInfo(null);
        }
      } catch (err) {
        console.error("Error cargando información del expediente:", err);
        setExpedienteInfo(null);
      }
    };

    void loadExpediente();
  }, [singleProjectId]);

  React.useEffect(() => {
    const loadTipos = async () => {
      try {
        const items: any[] = await sp.web.lists
          .getByTitle("TiposDocumentacion")
          .items.select("IDTipoDocumento", "Title")
          .filter("Activo eq 1")
          .top(5000)
          .get();
        setTiposDocumento(
          items.map((it) => ({
            Id: it.IDTipoDocumento as number,
            Title: it.Title as string,
          })),
        );
      } catch (err) {
        console.error("Error cargando TiposDocumentacion:", err);
      }
    };

    void loadTipos();
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    const loadGrupos = async (): Promise<void> => {
      try {
        let idTipoExpediente = DEFAULT_ID_TIPO_EXPEDIENTE;
        if (singleProjectId !== null) {
          const items: any[] = await sp.web.lists
            .getByTitle("Expedientes")
            .items.filter(`IDExpediente eq ${singleProjectId}`)
            .select("IDTipoExpediente")
            .top(1)
            .get();
          const tipoExpedienteNum = parseSharePointNumber(
            items[0]?.IDTipoExpediente,
          );
          if (tipoExpedienteNum !== null) {
            idTipoExpediente = tipoExpedienteNum;
          }
        }
        if (!isMounted) return;
        setGrupoFilter("");
        setTipoFilter("");
        setTiposDocumentoFiltrados([]);
        await cargarGruposDocumento(idTipoExpediente);
      } catch (err) {
        console.error("Error cargando grupos de documento:", err);
        if (isMounted) {
          setGruposDocumento([]);
        }
      }
    };

    void loadGrupos();
    return () => {
      isMounted = false;
    };
  }, [singleProjectId, cargarGruposDocumento]);

  // Si el catálogo de tipos llega después de elegir grupo, refrescar el cascado.
  React.useEffect(() => {
    if (!grupoFilter || tiposDocumento.length === 0) return;
    const idCarpeta = Number(grupoFilter);
    if (Number.isNaN(idCarpeta)) return;
    void loadTiposDocumentoPorCarpeta(idCarpeta, tiposDocumento);
  }, [tiposDocumento, grupoFilter, loadTiposDocumentoPorCarpeta]);

  const uniqueElaboradores = React.useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      t.elaborador
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .forEach((n) => set.add(n));
    });
    return Array.from(set).map((name) => ({ key: name, text: name }));
  }, [tasks]);

  const uniqueResponsables = React.useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.responsable) set.add(t.responsable);
    });
    return Array.from(set).map((name) => ({ key: name, text: name }));
  }, [tasks]);

  const tipoNombreById = React.useMemo(() => {
    const map: Record<number, string> = {};
    tiposDocumento.forEach((t) => {
      map[t.Id] = t.Title;
    });
    return map;
  }, [tiposDocumento]);

  const tableColSpan =
    (showExpedienteColumns ? 2 : 0) + // Nemotécnico, Nº corto
    1 + // Título
    (showExpedienteColumns ? 1 : 0) + // Tipo
    3 + // Fechas
    1 + // Estado
    (showElaboradoresColumn ? 1 : 0) +
    1 + // Responsable
    (showFlowColumns ? 2 : 0); // Aprobadores, Firmantes
  const elaboradoresSelectedItems = React.useMemo<IPersonaProps[]>(
    () =>
      elaboradoresFilter.map((name) => ({
        key: name,
        text: name,
      })),
    [elaboradoresFilter],
  );
  const responsablesSelectedItems = React.useMemo<IPersonaProps[]>(
    () =>
      responsablesFilter.map((name) => ({
        key: name,
        text: name,
      })),
    [responsablesFilter],
  );

  const totalPages =
    totalRows > 0 ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
  const pagedTasks = React.useMemo(() => tasks, [tasks]);

  React.useEffect(() => {
    setPage(1);
  }, [
    titleFilter,
    nemotecnicoFilter,
    codExpFilter,
    estadoFilter,
    grupoFilter,
    tipoFilter,
    startFrom,
    startTo,
    endFrom,
    endTo,
    deadlineFrom,
    deadlineTo,
    elaboradoresFilter,
    responsablesFilter,
    sortField,
    sortDirection,
    projectScopeKey,
    myTasksUserName,
    myFlowsUserName,
    forcedEstadosKey,
  ]);

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <section className={styles.container}>
      <div className={styles.column}>
        <div className={styles.card}>
          <div className={styles.containerHeader}>
            <div>
              <h2>{listTitle}</h2>
              {expedienteInfo && displayTitle && (
                <div className={styles.expedienteHeader}>
                  <span className={styles.expedienteId}>
                    Expediente {expedienteInfo.id}
                  </span>
                  {expedienteInfo.title && (
                    <span className={styles.expedienteTitle}>
                      {expedienteInfo.title}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className={styles.containerButton}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowFilters((prev) => !prev)}
              >
                {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
              </button>
              {!showFlowColumns && singleProjectId !== null && canCreateTask && (
                <a
                  href={`${absolutePath}/SitePages/alta-tarea.aspx?projectid=${singleProjectId}`}
                  className={styles.btnSearch}
                >
                  Agregar
                </a>
              )}
            </div>
          </div>

          {tasks.length > 0 && (
            <div className={styles.sortRow}>
              <div>
                <label>Ordenar por</label>
                <select
                  value={sortField}
                  onChange={(e) =>
                    setSortField(e.target.value as typeof sortField)
                  }
                >
                  <option value="start">Fecha inicio</option>
                  <option value="end">Fecha fin</option>
                  <option value="deadline">Fecha deadline</option>
                </select>
              </div>
              <div>
                <label>Dirección</label>
                <select
                  value={sortDirection}
                  onChange={(e) =>
                    setSortDirection(e.target.value as typeof sortDirection)
                  }
                >
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </select>
              </div>
            </div>
          )}

          {showFilters && (
            <div>
              {/* Fila 1: título y estado/tipo */}
              <div className={styles.filtersRow}>
                <div className={styles.filterBlockWide}>
                  <label>Título</label>
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => {
                      setTitleInput(e.target.value);
                    }}
                  />
                </div>

                {showExpedienteColumns && (
                  <div>
                    <label>Nemotécnico</label>
                    <input
                      type="text"
                      value={nemotecnicoInput}
                      onChange={(e) => {
                        setNemotecnicoInput(e.target.value);
                      }}
                    />
                  </div>
                )}

                {showExpedienteColumns && (
                  <div>
                    <label>Nº de exp. corto</label>
                    <input
                      type="text"
                      value={codExpInput}
                      onChange={(e) => {
                        setCodExpInput(e.target.value);
                      }}
                    />
                  </div>
                )}

                {showEstadoFilter && (
                  <div>
                    <label>Estado de la tarea</label>
                    <select
                      value={estadoFilter}
                      onChange={(e) => {
                        setEstadoFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Todos</option>
                      {estadoOptions.map((estado) => (
                        <option key={estado} value={estado}>
                          {isMyFlowsMode
                            ? getEstadoDisplayLabel(estado)
                            : estado}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label>Grupo de documentos</label>
                  <select
                    value={grupoFilter}
                    onChange={(e) => {
                      const value = e.target.value;
                      setGrupoFilter(value);
                      setTipoFilter("");
                      setTiposDocumentoFiltrados([]);
                      setPage(1);
                    }}
                    disabled={
                      loadingGruposDocumento || gruposDocumento.length === 0
                    }
                  >
                    <option value="">
                      {loadingGruposDocumento
                        ? "Cargando grupos..."
                        : gruposDocumento.length
                          ? "Todos"
                          : "Sin grupos disponibles"}
                    </option>
                    {gruposDocumento.map((grupo) => (
                      <option
                        key={grupo.idCarpeta}
                        value={String(grupo.idCarpeta)}
                      >
                        {grupo.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Tipo de documento</label>
                  <select
                    value={tipoFilter}
                    onChange={(e) => {
                      setTipoFilter(e.target.value);
                      setPage(1);
                    }}
                    disabled={
                      !grupoFilter ||
                      loadingTiposDocumento ||
                      tiposDocumentoOptions.length === 0
                    }
                  >
                    <option value="">
                      {!grupoFilter
                        ? "Seleccione un grupo"
                        : loadingTiposDocumento
                          ? "Cargando tipos..."
                          : tiposDocumentoOptions.length
                            ? "Todos"
                            : "Sin tipos disponibles"}
                    </option>
                    {tiposDocumentoOptions.map((t) => (
                      <option key={t.Id} value={t.Id.toString()}>
                        {t.Title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fila 2: fechas */}
              <div className={styles.filtersRow}>
                <div>
                  <label>Fecha inicio (desde)</label>
                  <DatePicker
                    firstDayOfWeek={DayOfWeek.Monday}
                    value={startFrom}
                    formatDate={getFormatDate}
                    onSelectDate={(date) => {
                      setStartFrom(date || undefined);
                      setPage(1);
                    }}
                    className={styles.datePicker}
                  />
                </div>
                <div>
                  <label>Fecha inicio (hasta)</label>
                  <DatePicker
                    firstDayOfWeek={DayOfWeek.Monday}
                    value={startTo}
                    formatDate={getFormatDate}
                    onSelectDate={(date) => {
                      setStartTo(date || undefined);
                      setPage(1);
                    }}
                    className={styles.datePicker}
                  />
                </div>
                <div>
                  <label>Fecha fin (desde)</label>
                  <DatePicker
                    firstDayOfWeek={DayOfWeek.Monday}
                    value={endFrom}
                    formatDate={getFormatDate}
                    onSelectDate={(date) => {
                      setEndFrom(date || undefined);
                      setPage(1);
                    }}
                    className={styles.datePicker}
                  />
                </div>
                <div>
                  <label>Fecha fin (hasta)</label>
                  <DatePicker
                    firstDayOfWeek={DayOfWeek.Monday}
                    value={endTo}
                    formatDate={getFormatDate}
                    onSelectDate={(date) => {
                      setEndTo(date || undefined);
                      setPage(1);
                    }}
                    className={styles.datePicker}
                  />
                </div>
              </div>

              {/* Fila 3: deadline + personas */}
              <div className={styles.filtersRow}>
                <div>
                  <label>Fecha deadline (desde)</label>
                  <DatePicker
                    firstDayOfWeek={DayOfWeek.Monday}
                    value={deadlineFrom}
                    formatDate={getFormatDate}
                    onSelectDate={(date) => {
                      setDeadlineFrom(date || undefined);
                      setPage(1);
                    }}
                    className={styles.datePicker}
                  />
                </div>
                <div>
                  <label>Fecha deadline (hasta)</label>
                  <DatePicker
                    firstDayOfWeek={DayOfWeek.Monday}
                    value={deadlineTo}
                    formatDate={getFormatDate}
                    onSelectDate={(date) => {
                      setDeadlineTo(date || undefined);
                      setPage(1);
                    }}
                    className={styles.datePicker}
                  />
                </div>

                <div className={styles.filterPeople}>
                  <PeoplePicker
                    users={uniqueElaboradores}
                    label={"Elaboradores"}
                    selectedItems={elaboradoresSelectedItems}
                    handleChange={(items: any[]) => {
                      const nombres =
                        items?.map((i) => i.text as string).filter(Boolean) ||
                        [];
                      setElaboradoresFilter(nombres);
                      setPage(1);
                    }}
                  />
                </div>

                <div className={styles.filterPeople}>
                  <PeoplePicker
                    users={uniqueResponsables}
                    label={"Responsable"}
                    selectedItems={responsablesSelectedItems}
                    handleChange={(items: any[]) => {
                      const nombres =
                        items?.map((i) => i.text as string).filter(Boolean) ||
                        [];
                      setResponsablesFilter(nombres);
                      setPage(1);
                    }}
                  />
                </div>
              </div>

              <div className={styles.filtersActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => {
                    setTitleInput("");
                    setTitleFilter("");
                    setNemotecnicoInput("");
                    setNemotecnicoFilter("");
                    setCodExpInput("");
                    setCodExpFilter("");
                    setEstadoFilter("");
                    setGrupoFilter("");
                    setTipoFilter("");
                    setTiposDocumentoFiltrados([]);
                    setStartFrom(undefined);
                    setStartTo(undefined);
                    setEndFrom(undefined);
                    setEndTo(undefined);
                    setDeadlineFrom(undefined);
                    setDeadlineTo(undefined);
                    setElaboradoresFilter([]);
                    setResponsablesFilter([]);
                    setPage(1);
                  }}
                >
                  Restablecer filtros
                </button>
              </div>
            </div>
          )}
          {isLoadingTasks ? (
            <table>
              <tbody>
                <tr>
                  <td colSpan={tableColSpan}>
                    <div className={styles.loadingRow}>
                      <div className={styles.loadingSpinner} />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : tasks.length === 0 ? (
            <div className={styles.emptyState}>
              {hasActiveFilters ? (
                <>
                  <h3>No se han encontrado tareas con los filtros aplicados</h3>
                  <p>
                    No hay tareas que cumplan los criterios actuales. Ajusta los
                    filtros o utiliza el botón{" "}
                    <strong>Restablecer filtros</strong> para volver a ver todas
                    las tareas del expediente.
                  </p>
                </>
              ) : (
                <>
                  <h3>Este expediente aún no tiene tareas documentales</h3>
                  <p>
                    Todavía no se ha registrado ninguna tarea asociada a este
                    expediente. Utiliza el botón <strong>Agregar</strong> para
                    crear la primera tarea y comenzar a gestionar su
                    documentación de forma controlada.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    {showExpedienteColumns && <th>Nemotécnico</th>}
                    {showExpedienteColumns && <th>Nº de exp. corto</th>}
                    <th>Título</th>
                    {showExpedienteColumns && <th>Tipo de documento</th>}
                    <th>Fecha inicio</th>
                    <th>Fecha fin</th>
                    <th>Fecha deadline</th>
                    <th>Estado</th>
                    {showElaboradoresColumn && <th>Elaboradores</th>}
                    <th>Responsable</th>
                    {showFlowColumns && <th>Aprobadores pendientes</th>}
                    {showFlowColumns && <th>Firmantes</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagedTasks.map((p) => (
                    <tr key={p.taskid}>
                      {showExpedienteColumns && (
                        <td>{p.nemotecnico || "—"}</td>
                      )}
                      {showExpedienteColumns && (
                        <td>{p.codExp || "—"}</td>
                      )}
                      <td>
                        <a
                          className={styles.projectName}
                          href={`${absolutePath}/SitePages/detalle-tarea.aspx?tareaid=${p.taskid}`}
                        >
                          {p.title}
                        </a>
                      </td>
                      {showExpedienteColumns && (
                        <td>
                          {(p.idTipo != null &&
                            Number.isFinite(p.idTipo) &&
                            tipoNombreById[p.idTipo]) ||
                            "—"}
                        </td>
                      )}
                      <td>{p.startDate}</td>
                      <td>{p.endDate}</td>
                      <td>
                        {p.deadlineDate ? (
                          <span
                            className={
                              isPastDisplayDate(p.deadlineDate)
                                ? styles.deadline
                                : undefined
                            }
                          >
                            {p.deadlineDate}
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                      <td>
                        {isMyFlowsMode
                          ? getEstadoDisplayLabel(p.estado)
                          : p.estado}
                      </td>
                      {showElaboradoresColumn && (
                        <td>
                          {p.elaborador
                            ? p.elaborador
                                .split(",")
                                .map((n) => n.trim())
                                .filter(Boolean)
                                .join(" · ")
                            : ""}
                        </td>
                      )}
                      <td>{p.responsable}</td>
                      {showFlowColumns && (
                        <td>
                          {p.nextAprobador ? (
                            <span className={styles.flowPeopleTag}>
                              {p.nextAprobador}
                            </span>
                          ) : (
                            <span className={styles.flowPeopleEmpty}>-</span>
                          )}
                        </td>
                      )}
                      {showFlowColumns && (
                        <td>
                          <div className={styles.flowPeopleCell}>
                            {(p.firmantesList || []).length > 0 ? (
                              (p.firmantesList || []).map((name) => (
                                <span
                                  key={`${p.taskid}-${name}`}
                                  className={styles.flowPeopleTag}
                                  title={name}
                                >
                                  {name}
                                </span>
                              ))
                            ) : (
                              <span className={styles.flowPeopleEmpty}>-</span>
                            )}
                          </div>
                        </td>
                      )}
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
      </div>
    </section>
  );
};

export default TaskList;
