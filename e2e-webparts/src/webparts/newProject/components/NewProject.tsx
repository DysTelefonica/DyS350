// @ts-nocheck
import { sp } from "@pnp/sp";
import * as React from "react";
import { ErrorAlert } from "../../../ui/errorAlert/ErrorAlert";
import { formatDate } from "../../../utils/utils";
import type {
  IExpedienteTreeNode,
  INewProjectProps,
  IPlantillaAprovisionamiento,
  IProjectForm,
  IProvisioningConfig,
  ITipoExpediente
} from "./INewProjectProps";
import styles from "./NewProject.module.scss";

const normalize = (text = "") =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const parseSharePointNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value !== null && "Id" in value) {
    return parseSharePointNumber((value as { Id?: unknown }).Id);
  }
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
};

const getPlantillasForTipoExpediente = (
  tipoExpedienteId: number | undefined,
  allPlantillas: IPlantillaAprovisionamiento[],
  plantillaIdsByTipoExpediente: Map<number, number[]>,
): IPlantillaAprovisionamiento[] => {
  if (tipoExpedienteId === undefined || tipoExpedienteId === null) return [];
  const linkedIds = plantillaIdsByTipoExpediente.get(tipoExpedienteId) || [];
  if (!linkedIds.length) return [];
  const idSet = new Set(linkedIds.map((id) => String(id)));
  return allPlantillas.filter((p) => idSet.has(p.id));
};

const buildPlantillaAppliedConfig = (
  config: IProvisioningConfig,
  plantilla: IPlantillaAprovisionamiento | undefined,
): IProvisioningConfig => {
  if (!plantilla) {
    return {
      ...config,
      carpetas: [],
      usarPlantilla: false,
      nombrePlantilla: undefined,
      plantillaAprovisionamientoId: undefined,
    };
  }
  return {
    ...config,
    carpetas: [...plantilla.carpetas],
    usarPlantilla: true,
    nombrePlantilla: plantilla.nombre,
    plantillaAprovisionamientoId: Number(plantilla.id),
    noGenerarCarpetas: config.noGenerarCarpetas,
  };
};

const hasTipoExpedienteSelected = (
  config: IProvisioningConfig | undefined,
): boolean => {
  if (!config) return false;
  const tipoId = config.tipoExpedienteId;
  return (
    tipoId !== undefined && tipoId !== null && !Number.isNaN(Number(tipoId))
  );
};

const parseSiNoFlag = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "si" || s === "sí" || s === "1" || s === "yes";
};

const getExpedientePrimaryIcon = (expediente: IProjectForm): string => {
  if (parseSiNoFlag(expediente.esam)) return "🏢";
  if (parseSiNoFlag(expediente.eslote)) return "📦";
  if (parseSiNoFlag(expediente.esbasado)) return "📁";
  return "📁";
};

const Input = ({ label, ...props }: { label: string; [key: string]: any }) => (
  <>
    {(props.value ||
      props.name === "idexpediente" ||
      props.name === "tiposproyecto") && (
      <div className={styles.field}>
        {props.type !== "hidden" && <label>{label}</label>}
        <input {...props} />
      </div>
    )}
  </>
);

interface IExpedienteRolesDisplay {
  preventa: string;
  jefeProyecto: string;
  ingenieros: string;
  tecnicoCalidad: string;
  tecnicoDocumentacion: string;
}

interface IFolderPreviewNode {
  name: string;
  path: string;
  children: IFolderPreviewNode[];
}

/** Extrae el número inicial del nombre: "01 Carpeta", "02. Nombre", etc. */
const getFolderLeadingNumber = (name: string): number | null => {
  const match = String(name || "")
    .trim()
    .match(/^(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
};

const compareFoldersByLeadingNumber = (aName: string, bName: string): number => {
  const na = getFolderLeadingNumber(aName);
  const nb = getFolderLeadingNumber(bName);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  if (na !== null && nb === null) return -1;
  if (na === null && nb !== null) return 1;
  return String(aName || "").localeCompare(String(bName || ""), "es", {
    sensitivity: "base",
  });
};

const sortFolderPreviewNodes = (
  nodes: IFolderPreviewNode[],
): IFolderPreviewNode[] => {
  const sorted = [...nodes].sort((a, b) =>
    compareFoldersByLeadingNumber(a.name, b.name),
  );
  sorted.forEach((node) => {
    node.children = sortFolderPreviewNodes(node.children);
  });
  return sorted;
};

const buildFolderPreviewTree = (paths: string[]): IFolderPreviewNode[] => {
  const root: IFolderPreviewNode[] = [];

  const insertPath = (
    nodes: IFolderPreviewNode[],
    segments: string[],
    basePath: string,
  ) => {
    if (!segments.length) return;
    const [current, ...rest] = segments;
    const currentPath = basePath ? `${basePath}/${current}` : current;

    let node = nodes.find((n) => n.name === current);
    if (!node) {
      node = { name: current, path: currentPath, children: [] };
      nodes.push(node);
    }

    insertPath(node.children, rest, currentPath);
  };

  paths.forEach((p) => {
    const clean = p.trim().replace(/^\/+|\/+$/g, "");
    if (!clean) return;
    const segments = clean.split("/");
    insertPath(root, segments, "");
  });

  return sortFolderPreviewNodes(root);
};

const PlantillaFolderPreview: React.FC<{ carpetas: string[] }> = ({
  carpetas,
}) => {
  const tree = React.useMemo(
    () => buildFolderPreviewTree(carpetas),
    [carpetas],
  );
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggle = (path: string) => {
    setExpanded((prev) => ({
      ...prev,
      [path]: !(prev[path] ?? true),
    }));
  };

  const renderNodes = (nodes: IFolderPreviewNode[], level: number) => {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = expanded[node.path] ?? true;
      return (
        <li key={node.path}>
          <div
            className={styles.plantillaFolderRow}
            style={{ marginLeft: level * 16 }}
          >
            {hasChildren && (
              <button
                type="button"
                className={styles.plantillaFolderToggle}
                onClick={() => toggle(node.path)}
              >
                {isExpanded ? "▾" : "▸"}
              </button>
            )}
            {!hasChildren && <span className={styles.plantillaFolderSpacer} />}
            <span className={styles.plantillaFolderIcon}>📁</span>
            <span>{node.name}</span>
          </div>
          {hasChildren && isExpanded && (
            <ul className={styles.plantillaPreviewList}>
              {renderNodes(node.children, level + 1)}
            </ul>
          )}
        </li>
      );
    });
  };

  if (!tree.length) return null;

  return (
    <div className={styles.plantillaPreview}>
      <div className={styles.plantillaPreviewTitle}>
        Estructura de la plantilla seleccionada
      </div>
      <ul className={styles.plantillaPreviewList}>
        {renderNodes(tree, 0)}
      </ul>
    </div>
  );
};

// Componente para mostrar un nodo del árbol de expedientes
const ExpedienteTreeNode: React.FC<{
  nodo: IExpedienteTreeNode;
  provisioningConfigs: Map<number, IProvisioningConfig>;
  allPlantillas: IPlantillaAprovisionamiento[];
  plantillaIdsByTipoExpediente: Map<number, number[]>;
  patronesNomenclatura: { Id: number; Title: string; PatronNomenclatura: string; }[];
  onCarpetasChange: (expedienteId: number, carpetas: string[]) => void;
  onCargarPlantilla: (
    expedienteId: number,
    plantilla: IPlantillaAprovisionamiento,
  ) => void;
  onGuardarPlantilla: (expedienteId: number, nombre: string) => void;
  onToggleNoGenerar: (expedienteId: number) => void;
  onToggleExtenderEstructuraAHijos: (
    expedienteId: number,
    checked: boolean,
  ) => void;
  carpetaDocumentacionTrabajo: string;
  onPatronNomenclaturaChange: (
    expedienteId: number,
    patronId: number | undefined,
  ) => void;
  /** Para expedientes ya existentes: IDExpediente -> Id del patrón guardado en la lista Expedientes */
  patronNomenclaturaPorExpediente: Map<number, number>;
  /** Para expedientes ya existentes: IDExpediente -> IDTipoExpediente (Expedientes) */
  tipoExpedientePorExpediente: Map<number, number>;
  tiposExpediente: ITipoExpediente[];
  onTipoExpedienteChange: (
    expedienteId: number,
    tipoExpedienteId: number | undefined,
  ) => void;
  rolesDisplay?: IExpedienteRolesDisplay;
  rolesDisplayByExpediente?: Map<number, IExpedienteRolesDisplay>;
  isRoot?: boolean;
}> = ({
  nodo,
  provisioningConfigs,
  allPlantillas,
  plantillaIdsByTipoExpediente,
  patronesNomenclatura = [],
  onCarpetasChange,
  onCargarPlantilla,
  onGuardarPlantilla,
  onToggleNoGenerar,
  onToggleExtenderEstructuraAHijos,
  carpetaDocumentacionTrabajo,
  onPatronNomenclaturaChange,
  patronNomenclaturaPorExpediente,
  tipoExpedientePorExpediente,
  tiposExpediente,
  onTipoExpedienteChange,
  rolesDisplay,
  rolesDisplayByExpediente,
  isRoot = false,
}) => {
  const provisioningConfig = provisioningConfigs.get(
    nodo.expediente.idexpediente,
  );

  const parseSiNo = (v: unknown): boolean => parseSiNoFlag(v);

  const flags: { key: string; icon: string; label: string }[] = [];
  if (parseSiNo(nodo.expediente.esam)) {
    flags.push({ key: "esam", icon: "🏢", label: "Esam" });
  }
  if (parseSiNo(nodo.expediente.eslote)) {
    flags.push({ key: "eslote", icon: "📦", label: "EsLote" });
  }
  if (parseSiNo(nodo.expediente.esbasado)) {
    flags.push({ key: "esbasado", icon: "📁", label: "EsBasado" });
  }
  const primaryFlagIcon = getExpedientePrimaryIcon(nodo.expediente);

  const [mostrarAprovisionamiento, setMostrarAprovisionamiento] =
    React.useState(false);
  const selectedPlantillaValue =
    provisioningConfig?.plantillaAprovisionamientoId != null
      ? String(provisioningConfig.plantillaAprovisionamientoId)
      : "";
  const selectedTipoExpedienteValue =
    provisioningConfig?.tipoExpedienteId != null
      ? String(provisioningConfig.tipoExpedienteId)
      : "";
  const plantillasFiltradas = React.useMemo(
    () =>
      getPlantillasForTipoExpediente(
        provisioningConfig?.tipoExpedienteId,
        allPlantillas,
        plantillaIdsByTipoExpediente,
      ),
    [
      provisioningConfig?.tipoExpedienteId,
      allPlantillas,
      plantillaIdsByTipoExpediente,
    ],
  );

  const roleDisplayNode =
    rolesDisplayByExpediente?.get(nodo.expediente.idexpediente) || rolesDisplay;
  const jefeProyecto = roleDisplayNode?.jefeProyecto ?? "—";
  const preventa = roleDisplayNode?.preventa ?? "—";
  const ingenieros = roleDisplayNode?.ingenieros ?? "—";
  const tecnicoCalidad = roleDisplayNode?.tecnicoCalidad ?? "—";
  const tecnicoDocumentacion = roleDisplayNode?.tecnicoDocumentacion ?? "—";

  const indentacion = nodo.nivel * 30;

  return (
    <div className={styles.treeNode}>
      <div
        className={styles.treeNodeHeader}
        style={{ paddingLeft: `${indentacion}px` }}
      >
        <div className={styles.treeNodeInfo}>
          <span className={styles.treeNodeIcon}>{primaryFlagIcon}</span>
          <div>
            <div className={styles.treeNodeNameRow}>
              <strong>{nodo.expediente.nemotecnico}</strong>
              {/* {flags.length > 0 && (
                <span className={styles.expedienteFlags} title={flags.map((f) => f.label).join(", ")}>
                  {flags.map((f) => (
                    <span
                      key={f.key}
                      className={styles.expedienteFlagIcon}
                      aria-label={f.label}
                    >
                      {f.icon}
                    </span>
                  ))}
                </span>
              )} */}
              {nodo.yaExiste && (
                <span className={styles.badgeExiste}>Ya existe</span>
              )}
            </div>
            <span className={styles.treeNodeId}>
              {" "}
              (ID: {nodo.expediente.idexpediente})
            </span>
            <div className={styles.treeNodeTitle}>{nodo.expediente.titulo}</div>
          </div>
        </div>
        <button
          type="button"
          className={styles.btnAprovisionar}
          onClick={() => setMostrarAprovisionamiento(!mostrarAprovisionamiento)}
        >
          {
            nodo.yaExiste ? (
              <>
              {mostrarAprovisionamiento
                ? "Ocultar información"
                : "Ver información"}              
              </>
            ) : (
              <>
              {mostrarAprovisionamiento
                ? "Ocultar aprovisionamiento"
                : "Configurar aprovisionamiento"}
              </>
            )
          }
        </button>
      </div>

      {mostrarAprovisionamiento && (provisioningConfig || nodo.yaExiste) && (
        <div
          className={styles.aprovisionamientoPanel}
          style={{ paddingLeft: `${indentacion + 20}px` }}
        >
          {/* Datos completos del expediente dentro del nodo (siempre solo lectura) */}
          <div className={styles.grid}>
            <Input
              label="Título del Proyecto"
              name="titulo"
              readOnly={true}
              value={nodo.expediente.titulo}
              className={styles.inputField}
            />
            <Input
              label="Expediente Padre"
              name="idexpedientepadre"
              type="number"
              readOnly={true}
              value={nodo.expediente.idexpedientepadre}
              className={styles.inputField}
            />
            <Input
              label="Nemotécnico"
              name="nemotecnico"
              readOnly={true}
              value={nodo.expediente.nemotecnico}
              className={styles.inputField}
            />
            <Input
              label="Código Proyecto"
              name="codproyecto"
              readOnly={true}
              value={nodo.expediente.codproyecto}
              className={styles.inputField}
            />
            <Input
              label="Código Expediente"
              name="codexp"
              readOnly={true}
              value={nodo.expediente.codexp}
              className={styles.inputField}
            />
            <Input
              label="Código Expediente Largo"
              name="codexplargo"
              readOnly={true}
              value={nodo.expediente.codexplargo}
              className={styles.inputField}
            />
            <Input
              label="Código S4H"
              name="cods4h"
              type="text"
              readOnly={true}
              value={nodo.expediente.cods4h}
              className={styles.inputField}
            />

            <Input
              label="Importe Licitación (€)"
              name="importelicitacion"
              type="number"
              readOnly={true}
              value={nodo.expediente.importelicitacion}
              className={styles.inputField}
            />
            <Input
              label="Importe Contratación (€)"
              name="importecontratacion"
              type="number"
              readOnly={true}
              value={nodo.expediente.importecontratacion}
              className={styles.inputField}
            />

            <Input
              label="Fecha Inicio Contrato"
              name="fechainiciocontrato"
              type="text"
              readOnly={true}
              value={
                nodo.expediente.fechainiciocontrato
                  ? formatDate(nodo.expediente.fechainiciocontrato).toString()
                  : ""
              }
              className={styles.inputField}
            />
            <Input
              label="Fecha Fin Contrato"
              name="fechafincontrato"
              type="text"
              readOnly={true}
              value={
                nodo.expediente.fechafincontrato
                  ? formatDate(nodo.expediente.fechafincontrato).toString()
                  : ""
              }
              className={styles.inputField}
            />
            <Input
              label="Fecha Fin Garantía"
              name="fechafingarantia"
              type="text"
              readOnly={true}
              value={
                nodo.expediente.fechafingarantia
                  ? formatDate(nodo.expediente.fechafingarantia).toString()
                  : ""
              }
              className={styles.inputField}
            />

            <Input
              label="Preventa"
              name="preventa"
              type="text"
              readOnly={true}
              value={preventa}
              className={styles.inputField}
            />

            <Input
              label="Jefe de Proyecto"
              name="jefeproyecto"
              type="text"
              readOnly={true}
              value={jefeProyecto}
              className={styles.inputField}
            />

            <Input
              label="Ingenieros"
              name="ingenieros"
              type="text"
              readOnly={true}
              value={ingenieros}
              className={styles.inputField}
            />
            <Input
              label="Técnicos de calidad"
              name="tecnicocalidad"
              type="text"
              readOnly={true}
              value={tecnicoCalidad}
              className={styles.inputField}
            />
            <Input
              label="Técnicos de documentación"
              name="tecnicodocumentacion"
              type="text"
              readOnly={true}
              value={tecnicoDocumentacion}
              className={styles.inputField}
            />

            {/* Patrón de nomenclatura: editable si no existe; solo lectura con valor de lista si ya existe */}
            {provisioningConfig ? (
              <>
                <div className={styles.field}>
                  <label>Codificación del documento</label>
                  <select
                    className={styles.selectEditable}
                    value={provisioningConfig.patronNomenclaturaId ?? ""}
                    onChange={(e) =>
                      onPatronNomenclaturaChange(
                        nodo.expediente.idexpediente,
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                  >
                    <option value="">Selecciona un patrón...</option>
                    {patronesNomenclatura.map((p) => (
                      <option key={p.Id} value={p.Id}>
                        {p.Title} ({p.PatronNomenclatura})
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Tipo de expediente</label>
                  <select
                    className={styles.selectEditable}
                    value={selectedTipoExpedienteValue}
                    onChange={(e) =>
                      onTipoExpedienteChange(
                        nodo.expediente.idexpediente,
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                  >
                    <option value="">Seleccionar tipo...</option>
                    {tiposExpediente.map((t) => (
                      <option
                        key={t.idTipoExpediente}
                        value={t.idTipoExpediente}
                      >
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : nodo.yaExiste ? (
              <>
                <div className={styles.field}>
                  <label>Codificación del documento</label>
                  <input
                    type="text"
                    readOnly
                    className={styles.inputField}
                    value={(() => {
                      const patronId = patronNomenclaturaPorExpediente.get(
                        nodo.expediente.idexpediente,
                      );
                      if (patronId === undefined || patronId === null) return "—";
                      const p = patronesNomenclatura.find(
                        (x) => x.Id === patronId,
                      );
                      return p ? p.Title : "—";
                    })()}
                  />
                </div>
                <div className={styles.field}>
                  <label>Tipo de expediente</label>
                  <input
                    type="text"
                    readOnly
                    className={styles.inputField}
                    value={(() => {
                      const tipoId = tipoExpedientePorExpediente.get(
                        nodo.expediente.idexpediente,
                      );
                      if (tipoId === undefined || tipoId === null) return "—";
                      const tipo = tiposExpediente.find(
                        (t) => t.idTipoExpediente === tipoId,
                      );
                      return tipo ? tipo.title : "—";
                    })()}
                  />
                </div>
              </>
            ) : null}

            <Input
              label="Responsable Calidad"
              name="idresponsablecalidad"
              type="hidden"
              readOnly={true}
              value={nodo.expediente.idresponsablecalidad}
              className={styles.inputField}
            />
            <Input
              label="Responsable Seguridad"
              name="idresponsableseguridad"
              type="hidden"
              readOnly={true}
              value={nodo.expediente.idresponsableseguridad}
              className={styles.inputField}
            />
          </div>

          {/* Opciones de aprovisionamiento solo si el expediente no existe aún */}
          {provisioningConfig && (
            <>
              

              {!provisioningConfig.noGenerarCarpetas && (
                <>
                  <div className={styles.plantillasSection}>
                    <div className={styles.plantillasSectionRow}>
                      <div className={`${styles.plantillaSelectField} ${styles.hide}`}>
                        <label>Cargar desde plantilla:</label>
                        <select
                          className={styles.selectPlantilla}
                          value={selectedPlantillaValue}
                          disabled={!provisioningConfig.tipoExpedienteId}
                          onChange={(e) => {
                            const nuevaId = e.target.value;
                            const plantilla = plantillasFiltradas.find(
                              (p) => p.id === nuevaId,
                            );
                            if (plantilla) {
                              onCargarPlantilla(
                                nodo.expediente.idexpediente,
                                plantilla,
                              );
                            }
                          }}
                        >
                          <option value="">
                            {!provisioningConfig.tipoExpedienteId
                              ? "Seleccione primero un tipo..."
                              : plantillasFiltradas.length
                                ? "Seleccionar plantilla..."
                                : "Sin plantillas para este tipo"}
                          </option>
                          {plantillasFiltradas.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {provisioningConfig.carpetas.length > 0 && (
                      <PlantillaFolderPreview
                        carpetas={provisioningConfig.carpetas}
                      />
                    )}
                  </div>

                  {/* {provisioningConfig.carpetas.length > 0 && (
                    <div className={styles.guardarPlantillaSection}>
                      {!mostrarGuardarPlantilla ? (
                        <button
                          type="button"
                          className={styles.btnGuardarPlantilla}
                          onClick={() => setMostrarGuardarPlantilla(true)}
                        >
                          Guardar como plantilla
                        </button>
                      ) : (
                        <div className={styles.inputGuardarPlantilla}>
                          <input
                            type="text"
                            placeholder="Nombre de la plantilla"
                            value={nombrePlantilla}
                            onChange={(e) => setNombrePlantilla(e.target.value)}
                            className={styles.inputNombrePlantilla}
                          />
                          <button
                            type="button"
                            className={styles.btnConfirmarPlantilla}
                            onClick={() => {
                              if (nombrePlantilla.trim()) {
                                onGuardarPlantilla(
                                  nodo.expediente.idexpediente,
                                  nombrePlantilla.trim(),
                                );
                                setNombrePlantilla("");
                                setMostrarGuardarPlantilla(false);
                              }
                            }}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className={styles.btnCancelarPlantilla}
                            onClick={() => {
                              setNombrePlantilla("");
                              setMostrarGuardarPlantilla(false);
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  )} */}
                </>
              )}

              {isRoot && nodo.hijos.length > 0 && (
                    <div className={styles.aprovisionamientoOptions}>
                      <label className={styles.checkboxOption}>
                        <input
                          type="checkbox"
                          checked={
                            provisioningConfig.extenderEstructuraAHijos
                          }
                          onChange={(e) =>
                            onToggleExtenderEstructuraAHijos(
                              nodo.expediente.idexpediente,
                              e.target.checked,
                            )
                          }
                        />
                        Aprovisionar y extender estructura a todos los nodos hijos
                      </label>
                    </div>
              )}
            </>
          )}
        </div>
      )}

      {nodo.hijos.length > 0 && (
        <div className={styles.treeNodeChildren}>
          {nodo.hijos.map((hijo) => (
            <ExpedienteTreeNode
              key={hijo.expediente.idexpediente}
              nodo={hijo}
              provisioningConfigs={provisioningConfigs}
              allPlantillas={allPlantillas}
              plantillaIdsByTipoExpediente={plantillaIdsByTipoExpediente}
              patronesNomenclatura={patronesNomenclatura}
              onCarpetasChange={onCarpetasChange}
              onCargarPlantilla={onCargarPlantilla}
              onGuardarPlantilla={onGuardarPlantilla}
              onToggleNoGenerar={onToggleNoGenerar}
              onToggleExtenderEstructuraAHijos={
                onToggleExtenderEstructuraAHijos
              }
              carpetaDocumentacionTrabajo={carpetaDocumentacionTrabajo}
              onPatronNomenclaturaChange={onPatronNomenclaturaChange}
              patronNomenclaturaPorExpediente={patronNomenclaturaPorExpediente}
              tipoExpedientePorExpediente={tipoExpedientePorExpediente}
              tiposExpediente={tiposExpediente}
              onTipoExpedienteChange={onTipoExpedienteChange}
              rolesDisplayByExpediente={rolesDisplayByExpediente}
              isRoot={false}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const NewProject: React.FC<INewProjectProps> = ({ context }) => {
  const [form, setForm] = React.useState<IProjectForm>({
    idexpediente: 0,
    nemotecnico: "",
    titulo: "",
  });
  const [isAuthorizedToCreate, setIsAuthorizedToCreate] = React.useState<
    boolean | null
  >(null);
  const [expedientes, setExpedientes] = React.useState<IProjectForm[]>([]);
  const [expedientesSelect, setExpedientesSelect] = React.useState<IProjectForm[]>(
    [],
  );
  const [singleExp, setExp] = React.useState<IProjectForm>();
  const [error, setError] = React.useState("");
  const [errorExp, setErrorExp] = React.useState("");
  const [expedienteTree, setExpedienteTree] = React.useState<
    IExpedienteTreeNode[]
  >([]);
  const [provisioningConfigs, setProvisioningConfigs] = React.useState<
    Map<number, IProvisioningConfig>
  >(new Map());
  // Snapshot de configs de hijos antes de marcar "Extender estructura...",
  // para restaurarlas al desmarcar el check.
  const configsHijosAntesDeExtenderRef = React.useRef<
    Map<number, Map<number, IProvisioningConfig>>
  >(new Map());
  const [allPlantillas, setAllPlantillas] = React.useState<
    IPlantillaAprovisionamiento[]
  >([]);
  const [plantillaIdsByTipoExpediente, setPlantillaIdsByTipoExpediente] =
    React.useState<Map<number, number[]>>(new Map());
  const [expedienteYaExiste, setExpedienteYaExiste] = React.useState(false);
  const [expedientesExistentes, setExpedientesExistentes] = React.useState<
    Set<number>
  >(new Set());
  const [mostrarAprovisionamiento, setMostrarAprovisionamiento] =
    React.useState(false);
  const [carpetaDocumentacionTrabajo, setCarpetaDocumentacionTrabajo] =
    React.useState("DOCUMENTACIÓN DE TRABAJO");
  const [isSaving, setIsSaving] = React.useState(false);
  const isSavingRef = React.useRef(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const [patronesNomenclatura, setPatronesNomenclatura] = React.useState<
    { Id: number; Title: string; PatronNomenclatura?: string }[]
  >([]);
  const [tiposExpediente, setTiposExpediente] = React.useState<
    ITipoExpediente[]
  >([]);
  /** Para expedientes ya existentes: IDExpediente -> Id del patrón guardado en la lista Expedientes */
  const [patronNomenclaturaPorExpediente, setPatronNomenclaturaPorExpediente] =
    React.useState<Map<number, number>>(new Map());
  const [tipoExpedientePorExpediente, setTipoExpedientePorExpediente] =
    React.useState<Map<number, number>>(new Map());
  const [rolesDisplayByExpediente, setRolesDisplayByExpediente] =
    React.useState<Map<number, IExpedienteRolesDisplay>>(new Map());
  const absolutePath = context.pageContext.web.absoluteUrl;

  React.useEffect(() => {
    const loadAprovisionadorPermission = async () => {
      try {
        // Aseguramos el setup del cliente PnP antes de consultar listas.
        sp.setup({ spfxContext: context });

        const currentUserName = (context.pageContext.user.displayName || "").trim();
        const currentUserEmail = (context.pageContext.user.email || "").trim();

        if (!currentUserName && !currentUserEmail) {
          window.location.href = `${absolutePath}/SitePages/Home.aspx`;
          return;
        }

        const escapeOdata = (value: string): string => value.replace(/'/g, "''");
        const filters: string[] = [];
        if (currentUserName) {
          filters.push(`Title eq '${escapeOdata(currentUserName)}'`);
        }
        if (currentUserEmail) {
          filters.push(`Correo eq '${escapeOdata(currentUserEmail)}'`);
        }

        if (!filters.length) {
          window.location.href = `${absolutePath}/SitePages/Home.aspx`;
          return;
        }

        const approvItems: any[] = await sp.web.lists
          .getByTitle("Aprovisionadores")
          .items.select("Title", "Correo")
          .filter(filters.join(" or "))
          .top(1)
          .get();

        if (approvItems.length > 0) {
          setIsAuthorizedToCreate(true);
          return;
        }

        // Fallback defensivo: si la comparación directa no encontró por variaciones de formato.
        const approvItemsAll: any[] = await sp.web.lists
          .getByTitle("Aprovisionadores")
          .items.select("Title", "Correo")
          .top(5000)
          .getAll();

        const userNameNorm = normalize(currentUserName);
        const userEmailNorm = currentUserEmail.toLowerCase();

        const hasPermission = approvItemsAll.some((item) => {
          const itemNameNorm = normalize((item.Title as string) || "");
          const itemEmailNorm = String(item.Correo || "").trim().toLowerCase();
          return (
            (userNameNorm && itemNameNorm === userNameNorm) ||
            (userEmailNorm && itemEmailNorm === userEmailNorm)
          );
        });

        setIsAuthorizedToCreate(hasPermission);
        if (!hasPermission) {
          window.location.href = `${absolutePath}/SitePages/Home.aspx`;
        }
      } catch (err) {
        console.error("Error validando Aprovisionadores:", err);
        setIsAuthorizedToCreate(false);
        window.location.href = `${absolutePath}/SitePages/Home.aspx`;
      }
    };

    void loadAprovisionadorPermission();
  }, [context, absolutePath]);

  const collectAllDescendantsIds = (nodes: IExpedienteTreeNode[]): number[] => {
    const ids: number[] = [];
    const walk = (n: IExpedienteTreeNode) => {
      ids.push(n.expediente.idexpediente);
      if (n.hijos && n.hijos.length) {
        n.hijos.forEach(walk);
      }
    };
    nodes.forEach(walk);
    return ids;
  };

  const collectDescendantsIdsByParentId = (
    nodes: IExpedienteTreeNode[],
    parentId: number,
  ): number[] => {
    for (const n of nodes) {
      if (n.expediente.idexpediente === parentId) {
        return collectAllDescendantsIds(n.hijos || []);
      }
      if (n.hijos && n.hijos.length) {
        const found = collectDescendantsIdsByParentId(n.hijos, parentId);
        if (found.length) return found;
      }
    }
    return [];
  };

  // Inicializar PnP SP con el contexto de SPFx
  React.useEffect(() => {
    sp.setup({
      spfxContext: context,
    });
  }, [context]);

  // Cargar opciones de la lista PatronesNomenclatura
  React.useEffect(() => {
    const loadPatrones = async () => {
      try {
        // @ts-ignore
        const items: any[] = await sp.web.lists
          .getByTitle("PatronesNomenclatura")
          .items.select("Id", "Title", "PatronNomenclatura")
          .get();

        setPatronesNomenclatura(
          items.map((it) => ({
            Id: it.Id,
            Title: it.Title,
            PatronNomenclatura: it.PatronNomenclatura as string,
          })),
        );
      } catch (err) {
        console.error(
          "Error cargando patrones de nomenclatura desde SharePoint:",
          err,
        );
      }
    };

    void loadPatrones();
  }, []);

  const getDefaultPatronNomenclaturaId = (): number | undefined =>
    patronesNomenclatura.length > 0 ? patronesNomenclatura[0].Id : undefined;

  React.useEffect(() => {
    const defaultPatronId = getDefaultPatronNomenclaturaId();
    if (defaultPatronId === undefined) return;

    setProvisioningConfigs((prev) => {
      if (prev.size === 0) return prev;

      let changed = false;
      const next = new Map(prev);
      next.forEach((config, expedienteId) => {
        if (config.patronNomenclaturaId == null) {
          next.set(expedienteId, {
            ...config,
            patronNomenclaturaId: defaultPatronId,
          });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [patronesNomenclatura]);

  // Cargar opciones de la lista TipoExpediente
  React.useEffect(() => {
    const loadTiposExpediente = async () => {
      try {
        const items: any[] = await sp.web.lists
          .getByTitle("TipoExpediente")
          .items.select("IDTipoExpediente", "Title")
          .top(5000)
          .get();

        setTiposExpediente(
          items
            .map((it) => {
              const idRaw = it.IDTipoExpediente ?? it.Id;
              const idNum = Number(idRaw);
              if (Number.isNaN(idNum)) return null;
              return {
                idTipoExpediente: idNum,
                title: String(it.Title || "").trim(),
              };
            })
            .filter(
              (t): t is ITipoExpediente =>
                t !== null && !!t.title && t.idTipoExpediente > 0,
            ),
        );
      } catch (err) {
        console.error(
          "Error cargando tipos de expediente desde SharePoint:",
          err,
        );
        setTiposExpediente([]);
      }
    };

    void loadTiposExpediente();
  }, []);

  // Actualizar el patrón de nomenclatura para un expediente concreto del árbol
  const onPatronNomenclaturaChange = (
    expedienteId: number,
    patronValue: number | undefined,
  ) => {
    setProvisioningConfigs((prev) => {
      const next = new Map(prev);
      const current = next.get(expedienteId);
      if (!current) {
        return prev;
      }
      const updatedParent = {
        ...current,
        patronNomenclaturaId: patronValue,
      };
      next.set(expedienteId, updatedParent);

      // Si este nodo (normalmente el padre) tiene activado extender, propagamos el patrón a los hijos
      if (updatedParent.extenderEstructuraAHijos) {
        const descendantIds = collectDescendantsIdsByParentId(
          expedienteTree,
          expedienteId,
        );
        descendantIds.forEach((childId) => {
          const childConfig = next.get(childId);
          if (!childConfig) return;
          next.set(childId, {
            ...childConfig,
            patronNomenclaturaId: patronValue,
          });
        });
      }
      return next;
    });
  };

  const onTipoExpedienteChange = (
    expedienteId: number,
    tipoExpedienteId: number | undefined,
  ) => {
    const plantillasParaTipo = getPlantillasForTipoExpediente(
      tipoExpedienteId,
      allPlantillas,
      plantillaIdsByTipoExpediente,
    );
    const primeraPlantilla = plantillasParaTipo[0];

    setProvisioningConfigs((prev) => {
      const next = new Map(prev);
      const current = next.get(expedienteId);
      if (!current) {
        return prev;
      }

      const applyTipoYPlantilla = (
        config: IProvisioningConfig,
      ): IProvisioningConfig => {
        const withTipo = {
          ...config,
          tipoExpedienteId,
        };
        return buildPlantillaAppliedConfig(withTipo, primeraPlantilla);
      };

      const updatedParent = applyTipoYPlantilla(current);
      next.set(expedienteId, updatedParent);

      if (updatedParent.extenderEstructuraAHijos) {
        const descendantIds = collectDescendantsIdsByParentId(
          expedienteTree,
          expedienteId,
        );
        descendantIds.forEach((childId) => {
          const childConfig = next.get(childId);
          if (!childConfig) return;
          next.set(childId, applyTipoYPlantilla(childConfig));
        });
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingRef.current || isSaving) return;
    isSavingRef.current = true;

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      if (!expedienteTree.length) {
        throw new Error("No hay expedientes en el árbol para guardar.");
      }

      // Aplanar el árbol de expedientes a una lista
      const allNodes: IExpedienteTreeNode[] = [];
      const collectNodes = (nodes: IExpedienteTreeNode[]) => {
        nodes.forEach((n) => {
          allNodes.push(n);
          if (n.hijos && n.hijos.length) {
            collectNodes(n.hijos);
          }
        });
      };
      collectNodes(expedienteTree);

      // Obtener todos los IDExpediente ya existentes en la lista "Expedientes"
      const existentesItems: any[] = await sp.web.lists
        .getByTitle("Expedientes")
        .items.select("IDExpediente")
        .top(5000)
        .getAll();

      const existentesSet = new Set<number>(
        existentesItems
          .map((it) => it.IDExpediente)
          .filter((id: any) => typeof id === "number"),
      );

      // Expedientes del árbol configurados para aprovisionar (tienen tipo)
      const configuradosParaAprovisionar = allNodes.filter((n) =>
        hasTipoExpedienteSelected(
          provisioningConfigs.get(n.expediente.idexpediente),
        ),
      );

      // Filtrar solo los que aún no están en la lista Expedientes
      const pendientes = allNodes.filter(
        (n) => !existentesSet.has(n.expediente.idexpediente),
      );

      // Solo damos de alta expedientes con tipo de expediente seleccionado.
      const pendientesSeleccionados = pendientes.filter((n) =>
        hasTipoExpedienteSelected(
          provisioningConfigs.get(n.expediente.idexpediente),
        ),
      );

      // Idempotencia: todo lo seleccionado ya estaba aprovisionado → éxito sin error.
      if (!pendientesSeleccionados.length) {
        if (configuradosParaAprovisionar.length > 0) {
          const todosYaExisten = configuradosParaAprovisionar.every((n) =>
            existentesSet.has(n.expediente.idexpediente),
          );
          if (todosYaExisten) {
            // Asegurar esAprovisionado en ExpedientesJSON (puede haber fallado en un intento previo).
            const expedientesJsonListEarly =
              sp.web.lists.getByTitle("ExpedientesJSON");
            for (const n of configuradosParaAprovisionar) {
              try {
                const jsonItems: any[] = await expedientesJsonListEarly.items
                  .filter(`IDExpediente eq ${n.expediente.idexpediente}`)
                  .select("Id")
                  .top(1)
                  .get();
                if (jsonItems.length) {
                  await expedientesJsonListEarly.items
                    .getById(jsonItems[0].Id as number)
                    .update({ esAprovisionado: true });
                }
              } catch (e) {
                console.error(
                  "No se pudo actualizar esAprovisionado en ExpedientesJSON para el expediente",
                  n.expediente.idexpediente,
                  e,
                );
              }
            }

            setSaveSuccess(true);
            await getData();
            setTimeout(() => {
              setForm({
                idexpediente: 0,
                nemotecnico: "",
                titulo: "",
              });
              setExp(undefined);
              setExpedienteTree([]);
              setProvisioningConfigs(new Map());
              configsHijosAntesDeExtenderRef.current = new Map();
              setMostrarAprovisionamiento(false);
              setExpedienteYaExiste(false);
              setExpedientesExistentes(new Set());
              setErrorExp("");
              setSaveSuccess(false);
            }, 2000);
            return;
          }
        }
        throw new Error(
          "Debe seleccionar el tipo de expediente en al menos un expediente para aprovisionar.",
        );
      }

      const pendientesSinPatron = pendientesSeleccionados.filter((n) => {
        const config = provisioningConfigs.get(n.expediente.idexpediente);
        if (!config) return true;
        const patronId = config.patronNomenclaturaId;
        return (
          patronId === undefined ||
          patronId === null ||
          Number.isNaN(Number(patronId))
        );
      });

      if (pendientesSinPatron.length > 0) {
        const idsSinPatron = pendientesSinPatron
          .map((n) => n.expediente.idexpediente)
          .join(", ");
        throw new Error(
          `Debe seleccionar un patrón de nomenclatura (codificación del documento) para cada expediente a aprovisionar. Revise los expedientes: ${idsSinPatron}.`,
        );
      }

      const pendientesSeleccionadosIds = new Set<number>(
        pendientesSeleccionados.map((n) => n.expediente.idexpediente),
      );

      // Validar jerarquía:
      // Si se da de alta un hijo, cada padre debe estar ya en la lista
      // o ir también en este mismo guardado.
      const pendientesSinPadreValido: Array<{
        hijoId: number;
        padresFaltantesIds: number[];
      }> = [];
      for (const n of pendientesSeleccionados) {
        let parentId = n.expediente.idexpedientepadre;
        const missingParents: number[] = [];
        while (parentId) {
          const padreExiste = existentesSet.has(parentId);
          const padreSeGuardara = pendientesSeleccionadosIds.has(parentId);
          if (!padreExiste && !padreSeGuardara) {
            if (!missingParents.includes(parentId)) {
              missingParents.push(parentId);
            }
          }
          const parentNode = allNodes.find(
            (node) => node.expediente.idexpediente === parentId,
          );
          parentId = parentNode?.expediente?.idexpedientepadre;
        }
        if (missingParents.length > 0) {
          pendientesSinPadreValido.push({
            hijoId: n.expediente.idexpediente,
            padresFaltantesIds: missingParents,
          });
        }
      }

      if (pendientesSinPadreValido.length > 0) {
        const detalle = pendientesSinPadreValido
          .map(
            (x) =>
              `hijo ${x.hijoId} -> faltan padres ${x.padresFaltantesIds.join(", ")}`,
          )
          .join("; ");
        throw new Error(
          `No se puede dar de alta un expediente hijo sin que sus padres estén dados de alta o incluidos en este guardado. Revise: ${detalle}.`,
        );
      }

      // Comprobar que para cada expediente seleccionado se ha marcado "No generar carpetas"
      // o se ha seleccionado una plantilla
      const pendientesSinAprovisionamiento = pendientesSeleccionados.filter((n) => {
        const config = provisioningConfigs.get(n.expediente.idexpediente);
        if (!config) return true;
        const noGenerar = config.noGenerarCarpetas;
        const tienePlantilla = !!config.usarPlantilla;
        return !noGenerar && !tienePlantilla;
      });

      if (pendientesSinAprovisionamiento.length > 0) {
        const idsSinConfig = pendientesSinAprovisionamiento
          .map((n) => n.expediente.idexpediente)
          .join(", ");
        throw new Error(
          `Para cada expediente debe marcarse "No generar carpetas para este expediente" o seleccionar una plantilla de aprovisionamiento. Revise los expedientes: ${idsSinConfig}.`,
        );
      }

      // Guardar cada expediente pendiente en la lista "Expedientes"
      // y registrar, si procede, su cliente en la lista "Clientes"
      // y sus jurídicas en la columna Juridicas / miembros en Miembros
      const clientesProcesados = new Set<string>();
      const estadosProcesados = new Set<string>();
      let resumedCount = 0;
      let createdCount = 0;

      // Cargar de antemano Suministradores (para Juridicas) y Roles_usuario (para Miembros)
      const suminItems: any[] = await sp.web.lists
        .getByTitle("Suministradores")
        .items.select("Title", "IDProyecto")
        .top(5000)
        .getAll();

      const juridicasByProyecto = new Map<number, string[]>();
      suminItems.forEach((s) => {
        const idProyecto = s.IDProyecto as number | undefined;
        if (typeof idProyecto !== "number") return;
        const nombre = (s.Title as string) || "";
        if (!nombre) return;
        const current = juridicasByProyecto.get(idProyecto) || [];
        current.push(nombre);
        juridicasByProyecto.set(idProyecto, current);
      });

      const rolesItemsForMiembros: any[] = await sp.web.lists
        .getByTitle("Roles_usuario")
        .items.select("Title", "usuario", "IDExpediente")
        .top(5000)
        .getAll();

      const miembrosByExpedienteParaGuardar = new Map<number, string[]>();
      rolesItemsForMiembros.forEach((r) => {
        const idExp = r.IDExpediente as number | undefined;
        if (typeof idExp !== "number") return;
        const nombre = (r.Title as string) || "";
        const correo = (r.usuario as string) || "";
        const miembroFormateado =
          nombre && correo ? `${nombre}-${correo}` : nombre || correo;
        if (!miembroFormateado) return;
        const current = miembrosByExpedienteParaGuardar.get(idExp) || [];
        current.push(miembroFormateado);
        miembrosByExpedienteParaGuardar.set(idExp, current);
      });

      const expedientesJsonList = sp.web.lists.getByTitle("ExpedientesJSON");
      const expedientesList = sp.web.lists.getByTitle("Expedientes");

      for (const nodo of pendientesSeleccionados) {
        const exp = nodo.expediente;
        const itemData: any = {
          Title: exp.titulo || "",
        };

        // Campos numéricos
        if (exp.idproyecto) {
          itemData.IDProyecto = exp.idproyecto;
        }
        if (exp.idexpediente) {
          itemData.IDExpediente = exp.idexpediente;
        }
        if (exp.idexpedientepadre) {
          itemData.IDExpedientePadre = exp.idexpedientepadre;
        }
        if (exp.importelicitacion) {
          itemData.ImporteLicitacion = exp.importelicitacion;
        }
        if (exp.importecontratacion) {
          itemData.ImporteContratacion = exp.importecontratacion;
        }
        if (exp.cods4h) {
          // CodS4h es texto en la lista Expedientes
          itemData.CodS4h = String(exp.cods4h);
        }
        if (exp.ordinal) {
          itemData.Ordinal = exp.ordinal;
        }
        if (exp.ordinale2e) {
          itemData.OrdinalE2E = exp.ordinale2e;
        }
        if (exp.npedido) {
          itemData.NPedido = exp.npedido;
        }
        // Identificadores de clasificación, órgano de contratación, oficina, ejército, estado y responsables
        if (exp.idgradoclasificacion) {
          itemData.IDGradoClasificacion = exp.idgradoclasificacion;
        }
        if (exp.idoficinaprograma) {
          itemData.IDOficinaPrograma = exp.idoficinaprograma;
        }
        if (exp.idejercito) {
          itemData.IDEjercito = exp.idejercito;
        }
        if (exp?.estado) {
          itemData.Estado = exp.estado;
        }
        let clienteLiteralForClientes: string | undefined;

        if (exp.idresponsablecalidad) {
          itemData.IDResponsableCalidad = exp.idresponsablecalidad;
        }
        if (exp.idresponsableseguridad) {
          itemData.IDResponsableSeguridad = exp.idresponsableseguridad;
        }

        // Campos de texto
        if (exp.nemotecnico) {
          itemData.Nemotecnico = exp.nemotecnico;
        }
        if (exp.codproyecto) {
          itemData.CodProyecto = exp.codproyecto;
        }
        if (exp.codexp) {
          itemData.CodExp = exp.codexp;
        }
        if (exp.codexplargo) {
          itemData.CodExpLargo = exp.codexplargo;
        }
        if (exp.esam) {
          itemData.Esam = exp.esam;
        }
        if (exp.eslote) {
          itemData.EsLote = exp.eslote;
        }
        if (exp.esbasado) {
          itemData.EsBasado = exp.esbasado;
        }
        if (exp.esexpediente) {
          itemData.EsExpediente = exp.esexpediente;
        }
        if (exp.observaciones) {
          itemData.Observaciones = exp.observaciones;
        }
        if (exp.ambito) {
          itemData.Ambito = exp.ambito;
        }
        if (exp.adjudicado) {
          itemData.Adjudicado = exp.adjudicado;
        }
        if (exp.tipoinforme) {
          itemData.TipoInforme = exp.tipoinforme;
        }
        if (exp.tipo) {
          itemData.Type = exp.tipo;
        }
        if (exp.cadenapecal) {
          itemData.CadenaPecal = exp.cadenapecal;
        }
        if (exp.garantiameses) {
          itemData.GarantiaMeses = exp.garantiameses;
        }
        if (exp.codigoactividad) {
          itemData.CodigoActividad = exp.codigoactividad;
        }
        if (exp.contratistaprincipal) {
          itemData.ContratistaPrincipal = exp.contratistaprincipal;
        }
        if (typeof exp.favorito === "boolean") {
          itemData.Favorito = exp.favorito;
        }
        if (exp.cliente) {
          itemData.Cliente = exp.cliente;
          clienteLiteralForClientes = exp.cliente;
        }

        // Juridicas: usar los Title de la lista Suministradores cuyo IDProyecto == IDExpediente
        const juridicasNombres =
          juridicasByProyecto.get(exp.idexpediente) || [];
        if (juridicasNombres.length) {
          // Guardamos varias jurídicas en un solo campo de texto separadas por ';'
          itemData.Juridicas = juridicasNombres.join(";");
        }

        // Miembros: usar los Title de la lista Roles_usuario cuyo IDExpediente == IDExpediente
        const miembros =
          miembrosByExpedienteParaGuardar.get(exp.idexpediente) || [];
        if (miembros.length) {
          // Guardamos todos los miembros en un único campo de texto separados por ';'
          itemData.Miembros = miembros.join(";");
        }

        // Patrón de nomenclatura específico por expediente (si existe)
        // En la lista "Expedientes" esta columna debe almacenar el ID del patrón (PatronesNomenclatura.Id).
        const config = provisioningConfigs.get(exp.idexpediente);
        if (config && config.patronNomenclaturaId != null) {
          itemData.PatronNomenclatura = config.patronNomenclaturaId;
        }

        // ID de plantilla de aprovisionamiento (si existe)
        if (
          config &&
          config.plantillaAprovisionamientoId !== undefined &&
          config.plantillaAprovisionamientoId !== null
        ) {
          itemData.IDPlantillaAprovisionamiento =
            config.plantillaAprovisionamientoId;
        }

        if (
          config &&
          config.tipoExpedienteId !== undefined &&
          config.tipoExpedienteId !== null
        ) {
          itemData.IDTipoExpediente = config.tipoExpedienteId;
        }

        // Campos de fecha y hora
        if (exp.fechainiciocontrato) {
          itemData.FechaInicioContrato = new Date(exp.fechainiciocontrato);
        }
        if (exp.fechafincontrato) {
          itemData.FechaFinContrato = new Date(exp.fechafincontrato);
        }
        if (exp.fechafingarantia) {
          itemData.FechaFinGarantia = new Date(exp.fechafingarantia);
        }
        if (exp.fechapreoferta) {
          itemData.FechaPreOferta = new Date(exp.fechapreoferta);
        }
        if (exp.fechainiciolicitacion) {
          itemData.FechaInicioLicitacion = new Date(exp.fechainiciolicitacion);
        }
        if (exp.fechaoferta) {
          itemData.FechaOferta = new Date(exp.fechaoferta);
        }
        if (exp.fechaadjudicacion) {
          itemData.FechaAdjudicacion = new Date(exp.fechaadjudicacion);
        }
        if (exp.fechafirmacontrato) {
          itemData.FechaFirmaContrato = new Date(exp.fechafirmacontrato);
        }
        if (exp.fechacertificacion) {
          itemData.FechaCertificacion = new Date(exp.fechacertificacion);
        }
        if (exp.fechaperdida) {
          itemData.FechaPerdida = new Date(exp.fechaperdida);
        }
        if (exp.fechadesestimada) {
          itemData.FechaDesestimada = new Date(exp.fechadesestimada);
        }

        // Idempotencia por ítem: no crear duplicado si ya existe IDExpediente.
        let alreadyExists = existentesSet.has(exp.idexpediente);
        if (!alreadyExists) {
          try {
            const existingById: any[] = await expedientesList.items
              .filter(`IDExpediente eq ${exp.idexpediente}`)
              .select("Id")
              .top(1)
              .get();
            alreadyExists = existingById.length > 0;
          } catch (lookupErr) {
            console.warn(
              "No se pudo comprobar existencia previa del expediente",
              exp.idexpediente,
              lookupErr,
            );
          }
        }

        if (alreadyExists) {
          resumedCount += 1;
          existentesSet.add(exp.idexpediente);
        } else {
          await expedientesList.items.add(itemData);
          createdCount += 1;
          existentesSet.add(exp.idexpediente);
        }

        // Registrar el estado en la lista "EstadosProyecto" si no existe aún
        if (exp?.estado) {
          const estadoLiteral = String(exp.estado).trim();
          if (estadoLiteral && !estadosProcesados.has(estadoLiteral)) {
            estadosProcesados.add(estadoLiteral);
            const escapeODataValue = (value: string): string =>
              value.replace(/'/g, "''");
            const existingEstado: any[] = await sp.web.lists
              .getByTitle("EstadosProyecto")
              .items.select("Id")
              .filter(`Title eq '${escapeODataValue(estadoLiteral)}'`)
              .top(1)
              .get();
            if (!existingEstado.length) {
              await sp.web.lists
                .getByTitle("EstadosProyecto")
                .items.add({ Title: estadoLiteral });
            }
          }
        }

        // Marcar el expediente como aprovisionado en la lista "ExpedientesJSON"
        try {
          const jsonItems: any[] = await expedientesJsonList.items
            .filter(`IDExpediente eq ${exp.idexpediente}`)
            .select("Id")
            .top(1)
            .get();
          if (jsonItems.length) {
            const jsonId = jsonItems[0].Id as number;
            await expedientesJsonList.items
              .getById(jsonId)
              .update({ esAprovisionado: true });
          }
        } catch (e) {
          console.error(
            "No se pudo actualizar esAprovisionado en ExpedientesJSON para el expediente",
            exp.idexpediente,
            e,
          );
        }

        // Registrar el cliente en la lista "Clientes" si no existe aún
        if (clienteLiteralForClientes) {
          const nombreCliente = clienteLiteralForClientes.trim();
          if (nombreCliente && !clientesProcesados.has(nombreCliente)) {
            clientesProcesados.add(nombreCliente);

            const escaped = nombreCliente.replace(/'/g, "''");
            const existentesCliente: any[] = await sp.web.lists
              .getByTitle("Clientes")
              .items.select("Id")
              .filter(`Title eq '${escaped}'`)
              .top(1)
              .get();

            if (!existentesCliente.length) {
              await sp.web.lists
                .getByTitle("Clientes")
                .items.add({ Title: nombreCliente });
            }
          }
        }

        // Ya no guardamos Suministradores, Hitos ni Roles_usuario aquí.
        // Estas listas serán alimentadas por un flujo de Power Automate.
      }

      setSaveSuccess(true);
      console.log(
        "Expedientes guardados exitosamente:",
        pendientesSeleccionados.map((p) => p.expediente.idexpediente),
        { createdCount, resumedCount },
      );

      // Refrescar la lista de expedientes disponibles en el select (filtrados por esAprovisionado)
      await getData();

      // Limpiar el formulario después de guardar exitosamente
      setTimeout(() => {
        setForm({
          idexpediente: 0,
          nemotecnico: "",
          titulo: "",
        });
        setExp(undefined);
        setExpedienteTree([]);
        setProvisioningConfigs(new Map());
        configsHijosAntesDeExtenderRef.current = new Map();
        setMostrarAprovisionamiento(false);
        setExpedienteYaExiste(false);
        setExpedientesExistentes(new Set());
        setErrorExp("");
        setSaveSuccess(false);
      }, 2000);
    } catch (err: any) {
      console.error("Error al guardar el expediente:", err);
      setSaveError(
        err.message ||
          "Error al guardar el expediente. Por favor, intente nuevamente.",
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const getData = async () => {
    setError("");
    try {
      // Leemos los expedientes desde la lista de SharePoint "ExpedientesJSON"
      const items: any[] = await sp.web.lists
        .getByTitle("ExpedientesJSON")
        .items.select(
          "IDExpediente",
          "IDExpedientePadre",
          "Estado",
          "organoContratacion",
          "Nemotecnico",
          "Title",
          "ImporteLicitacion",
          "ImporteContratacion",
          "CodProyecto",
          "CodExp",
          "CodExpLargo",
          "CodS4h",
          "FechaInicioContrato",
          "FechaFinContrato",
          "FechaFinGarantia",
          "Esam",
          "EsLote",
          "EsBasado",
          "EsExpediente",
          "Ordinal",
          "OrdinalE2E",
          "IDGradoClasificacion",
          "Observaciones",
          "Ambito",
          "NPedido",
          "IDResponsableCalidad",
          "Adjudicado",
          "Type",
          "CadenaPecal",
          "FechaPreOferta",
          "FechaInicioLicitacion",
          "FechaOferta",
          "FechaAdjudicacion",
          "FechaFirmaContrato",
          "GarantiaMeses",
          "FechaCertificacion",
          "FechaPerdida",
          "FechaDesestimada",
          "IDResponsableSeguridad",
          "esAprovisionado",
        )
        .top(5000)
        .getAll();

      const mapped: IProjectForm[] = items.map((it) => ({
        idexpediente: it.IDExpediente as number,
        idexpedientepadre: it.IDExpedientePadre as number | undefined,
        estado: it.Estado as number | undefined,
        cliente: it.organoContratacion as string | undefined,
        nemotecnico: (it.Nemotecnico as string) || "",
        titulo: (it.Title as string) || "",
        importelicitacion: it.ImporteLicitacion as number | undefined,
        importecontratacion: it.ImporteContratacion as number | undefined,
        codproyecto: (it.CodProyecto as string) || "",
        codexp: (it.CodExp as string) || "",
        codexplargo: (it.CodExpLargo as string) || "",
        cods4h: it.CodS4h as string | undefined,
        fechainiciocontrato: it.FechaInicioContrato as string | undefined,
        fechafincontrato: it.FechaFinContrato as string | undefined,
        fechafingarantia: it.FechaFinGarantia as string | undefined,
        esam: it.Esam as string | undefined,
        eslote: it.EsLote as string | undefined,
        esbasado: it.EsBasado as string | undefined,
        esexpediente: it.EsExpediente as string | undefined,
        ordinal: it.Ordinal as number | undefined,
        ordinale2e: it.OrdinalE2E as number | undefined,
        idgradoclasificacion: it.IDGradoClasificacion as number | undefined,
        observaciones: it.Observaciones as string | undefined,
        ambito: it.Ambito as string | undefined,
        npedido: it.NPedido as number | undefined,
        idresponsablecalidad: it.IDResponsableCalidad as number | undefined,
        adjudicado: it.Adjudicado as string | undefined,
        tipo: it.Type as string | undefined,
        cadenapecal: it.CadenaPecal as string | undefined,
        fechapreoferta: it.FechaPreOferta as string | undefined,
        fechainiciolicitacion: it.FechaInicioLicitacion as string | undefined,
        fechaoferta: it.FechaOferta as string | undefined,
        fechaadjudicacion: it.FechaAdjudicacion as string | undefined,
        fechafirmacontrato: it.FechaFirmaContrato as string | undefined,
        garantiameses: it.GarantiaMeses as string | undefined,
        fechacertificacion: it.FechaCertificacion as string | undefined,
        fechaperdida: it.FechaPerdida as string | undefined,
        fechadesestimada: it.FechaDesestimada as string | undefined,
        idresponsableseguridad: it.IDResponsableSeguridad as number | undefined,
        esAprovisionado: it.esAprovisionado as boolean | number | string | undefined,
        // Estas propiedades (suministradores, responsables, etc.) ya no se
        // alimentan desde aquí porque las rellenará un flujo de Power Automate.
        suministradores: undefined,
        responsables: [],
        responsableCalidad: undefined,
        responsableSeguridad: undefined,
      }));

      const isNoAprovisionado = (it: any): boolean => {
        const v = it?.esAprovisionado;
        return (
          v == null ||
          v === false ||
          v === 0 ||
          String(v || "")
            .trim()
            .toLowerCase() === "false"
        );
      };

      setExpedientes(mapped);

      // Select: solo expedientes de primer nivel (sin padre) que tengan
      // algún nodo no aprovisionado en su subárbol.
      const byId = new Map<number, IProjectForm>();
      mapped.forEach((m) => byId.set(m.idexpediente, m));

      const childrenByParent = new Map<number, number[]>();
      mapped.forEach((m) => {
        const parentId = m.idexpedientepadre;
        if (parentId === null || parentId === undefined || parentId === 0) return;
        const list = childrenByParent.get(parentId) || [];
        list.push(m.idexpediente);
        childrenByParent.set(parentId, list);
      });

      const roots = mapped.filter((m) => {
        const parentId = m.idexpedientepadre;
        return parentId === null || parentId === undefined || parentId === 0;
      });

      const pendingInSubtree = (rootId: number): boolean => {
        const node = byId.get(rootId);
        if (!node) return false;

        // Incluimos el propio nodo: si el root no está aprovisionado, cuenta.
        if (isNoAprovisionado(node)) return true;

        const children = childrenByParent.get(rootId) || [];
        return children.some((childId) => pendingInSubtree(childId));
      };

      const filteredRoots = roots.filter((r) => pendingInSubtree(r.idexpediente));
      setExpedientesSelect(filteredRoots);
    } catch (err) {
      console.error("Error al obtener expedientes desde ExpedientesJSON:", err);
      setError("No se ha podido obtener la data de los expedientes.");
    }
  };

  // Construir árbol de expedientes (padres, hijos, nietos)
  const construirArbolExpedientes = (
    expedienteId: number,
    todosExpedientes: IProjectForm[],
    nivel: number = 0,
    existentesEnLista?: Set<number>,
  ): IExpedienteTreeNode | null => {
    const setExistentes = existentesEnLista ?? expedientesExistentes;
    const expediente = todosExpedientes.find(
      (exp) => exp.idexpediente === expedienteId,
    );
    if (!expediente) return null;

    // Buscar hijos directos
    const hijos = todosExpedientes
      .filter((exp) => exp.idexpedientepadre === expedienteId)
      .map((hijo) =>
        construirArbolExpedientes(
          hijo.idexpediente,
          todosExpedientes,
          nivel + 1,
          setExistentes,
        ),
      )
      .filter((node): node is IExpedienteTreeNode => node !== null);

    return {
      expediente,
      hijos,
      nivel,
      yaExiste: setExistentes.has(expedienteId),
    };
  };

  // Construir árbol completo con padres, hijos y nietos
  const construirArbolCompleto = (
    expedienteId: number,
    todosExpedientes: IProjectForm[],
    existentesEnLista: Set<number>,
  ): IExpedienteTreeNode[] => {
    const expediente = todosExpedientes.find(
      (exp) => exp.idexpediente === expedienteId,
    );
    if (!expediente) return [];

    // Encontrar la raíz del árbol (expediente sin padre o el más antiguo)
    let raizId = expedienteId;
    let actual = expediente;

    while (actual.idexpedientepadre) {
      const padre = todosExpedientes.find(
        (exp) => exp.idexpediente === actual.idexpedientepadre,
      );
      if (padre) {
        raizId = padre.idexpediente;
        actual = padre;
      } else {
        break;
      }
    }

    const raiz = construirArbolExpedientes(
      raizId,
      todosExpedientes,
      0,
      existentesEnLista,
    );
    return raiz ? [raiz] : [];
  };

  const handleSearchExp = async (idexpediente:number) => {
    setErrorExp("");
    setSaveError("");
    setExpedienteYaExiste(false);
    setMostrarAprovisionamiento(false);
    setExpedientesExistentes(new Set());
    setPatronNomenclaturaPorExpediente(new Map());
    setTipoExpedientePorExpediente(new Map());

    const findExp = expedientes.filter((exp) => exp.idexpediente === idexpediente);
    if (findExp.length === 1) {
      const expedienteEncontrado = findExp[0];
      setExp(expedienteEncontrado);
      setForm(expedienteEncontrado);

      try {
        // Verificar en la lista "Expedientes" de SharePoint qué IDExpediente ya existen y su PatronNomenclatura
        const existentesItems: any[] = await sp.web.lists
          .getByTitle("Expedientes")
          .items.select("IDExpediente", "PatronNomenclatura", "IDTipoExpediente")
          .top(5000)
          .getAll();

        const existentesSet = new Set<number>(
          existentesItems
            .map((it) => it.IDExpediente)
            .filter((id: any) => typeof id === "number"),
        );
        setExpedientesExistentes(existentesSet);

        const patronMap = new Map<number, number>();
        const tipoMap = new Map<number, number>();
        existentesItems.forEach((it: any) => {
          const idExp = it.IDExpediente;
          if (typeof idExp !== "number") return;

          // La columna "PatronNomenclatura" ahora debe devolver el ID numérico del patrón.
          const patronIdRaw =
            it.PatronNomenclaturaId ??
            it.PatronNomenclatura?.Id ??
            it.PatronNomenclatura;

          const patronIdNum =
            typeof patronIdRaw === "number"
              ? patronIdRaw
              : patronIdRaw != null
                ? Number(patronIdRaw)
                : NaN;

          if (!Number.isNaN(patronIdNum)) {
            patronMap.set(idExp, patronIdNum);
          }

          const tipoId = parseSharePointNumber(it.IDTipoExpediente);
          if (tipoId !== null) {
            tipoMap.set(idExp, tipoId);
          }
        });
        setPatronNomenclaturaPorExpediente(patronMap);
        setTipoExpedientePorExpediente(tipoMap);

        if (existentesSet.has(expedienteEncontrado.idexpediente)) {
          setExpedienteYaExiste(true);
        }

        // Construir árbol completo usando los IDs existentes en SharePoint
        const arbol = construirArbolCompleto(
          expedienteEncontrado.idexpediente,
          expedientes,
          existentesSet,
        );
        setExpedienteTree(arbol);

        // Obtener todos los IDExpediente del árbol para cargar sus roles
        const idsExpedientes = new Set<number>();
        const collectIds = (nodos: IExpedienteTreeNode[]) => {
          nodos.forEach((n) => {
            idsExpedientes.add(n.expediente.idexpediente);
            if (n.hijos && n.hijos.length) {
              collectIds(n.hijos);
            }
          });
        };
        collectIds(arbol);

        // Resolver IDs de roles dinámicamente desde la lista "Roles"
        const rolesCatalogItems: any[] = await sp.web.lists
          .getByTitle("Roles")
          .items.select("Title", "IDRol")
          .top(5000)
          .getAll();

        const roleIdByName = new Map<string, number>();
        rolesCatalogItems.forEach((role) => {
          const roleName = normalize((role?.Title as string) || "");
          const roleIdNum = Number(role?.IDRol);
          if (!roleName || !isFinite(roleIdNum)) return;
          roleIdByName.set(roleName, roleIdNum);
        });

        const roleIds = {
          preventa: roleIdByName.get(normalize("Preventa")),
          jefeProyecto: roleIdByName.get(normalize("Jefe de proyecto")),
          ingenieros: roleIdByName.get(normalize("Ingenieros")),
          tecnicoCalidad: roleIdByName.get(normalize("Técnicos de calidad")),
          tecnicoDocumentacion: roleIdByName.get(
            normalize("Técnicos de documentación"),
          ),
        };

        // Cargar miembros desde Roles_usuario
        const rolesUsuarioItems: any[] = await sp.web.lists
          .getByTitle("Roles_usuario")
          .items.select("Title", "IDRol", "IDExpediente")
          .top(5000)
          .getAll();

        const agrupado = new Map<
          number,
          {
            preventa: string[];
            jefes: string[];
            ingenieros: string[];
            calidad: string[];
            doc: string[];
          }
        >();

        rolesUsuarioItems.forEach((r) => {
          const idExp = r.IDExpediente as number;
          if (!idsExpedientes.has(idExp)) return;
          const nombre = (r.Title as string) || "";
          if (!nombre) return;
          const idRol = r.IDRol as number | undefined;

          if (!agrupado.has(idExp)) {
            agrupado.set(idExp, {
              preventa: [],
              jefes: [],
              ingenieros: [],
              calidad: [],
              doc: [],
            });
          }

          const entry = agrupado.get(idExp)!;

          if (idRol === roleIds.preventa) {
            entry.preventa.push(nombre);
          } else if (idRol === roleIds.jefeProyecto) {
            entry.jefes.push(nombre);
          } else if (idRol === roleIds.ingenieros) {
            entry.ingenieros.push(nombre);
          } else if (idRol === roleIds.tecnicoCalidad) {
            entry.calidad.push(nombre);
          } else if (idRol === roleIds.tecnicoDocumentacion) {
            entry.doc.push(nombre);
          }
        });

        const rolesMap = new Map<number, IExpedienteRolesDisplay>();
        agrupado.forEach((val, idExp) => {
          rolesMap.set(idExp, {
            preventa: val.preventa.join(", ") || "—",
            jefeProyecto: val.jefes.join(", ") || "—",
            ingenieros: val.ingenieros.join(", ") || "—",
            tecnicoCalidad: val.calidad.join(", ") || "—",
            tecnicoDocumentacion: val.doc.join(", ") || "—",
          });
        });
        setRolesDisplayByExpediente(rolesMap);

        // Inicializar configuraciones de aprovisionamiento para cada expediente
        const configs = new Map<number, IProvisioningConfig>();
        const defaultPatronId = patronesNomenclatura[0]?.Id;
        const inicializarConfigs = (nodos: IExpedienteTreeNode[]) => {
          nodos.forEach((nodo) => {
            if (!nodo.yaExiste) {
              configs.set(nodo.expediente.idexpediente, {
                expedienteId: nodo.expediente.idexpediente,
                patronNomenclaturaId: defaultPatronId,
                carpetas: [],
                usarPlantilla: false,
                plantillaAprovisionamientoId: undefined,
                extenderEstructuraAHijos: false,
                noGenerarCarpetas: false,
              });
            }
            if (nodo.hijos.length > 0) {
              inicializarConfigs(nodo.hijos);
            }
          });
        };
        inicializarConfigs(arbol);
        configsHijosAntesDeExtenderRef.current = new Map();
        setProvisioningConfigs(configs);

        setMostrarAprovisionamiento(true);
      } catch (err) {
        setErrorExp(
          "No se pudo verificar los expedientes existentes en SharePoint.",
        );
      }
      return;
    }
    setErrorExp(`El expediente ${idexpediente} no se ha encontrado.`);
    setExp(undefined);
  };

  // Cargar plantillas guardadas desde la lista TiposPlantillaAprovisionamiento
  // y su estructura de carpetas desde la biblioteca Configuracion/Plantillas
  const cargarPlantillas = async () => {
    try {
      // Leemos las plantillas desde SharePoint
      const items: any[] = await sp.web.lists
        .getByTitle("TiposPlantillaAprovisionamiento")
        .items.select("Id", "IDPlantillaAprovisionamiento", "Title")
        .get();

      const plantillasDesdeLista: IPlantillaAprovisionamiento[] =
        await Promise.all(
          items.map(async (it) => {
            const nombre = it.Title as string;
            let carpetas: string[] = [];
            if (nombre) {
              carpetas = await obtenerCarpetasPlantilla(nombre);
            }
            return {
              id: String(it.IDPlantillaAprovisionamiento),
              nombre,
              carpetas,
            };
          }),
        );

      setAllPlantillas(plantillasDesdeLista);
    } catch (err) {
      console.error(
        "Error cargando TiposPlantillaAprovisionamiento desde SharePoint:",
        err,
      );
      setAllPlantillas([]);
    }
  };

  const cargarTipoExpedientePlantillaLinks = async () => {
    try {
      const items: any[] = await sp.web.lists
        .getByTitle("TipoExpediente_plantilla")
        .items.select("IDTipoExpediente", "IDPlantillaAprovisionamiento")
        .top(5000)
        .getAll();

      const linksMap = new Map<number, number[]>();
      items.forEach((it) => {
        const tipoId = parseSharePointNumber(it.IDTipoExpediente);
        const plantillaId = parseSharePointNumber(
          it.IDPlantillaAprovisionamiento,
        );
        if (tipoId === null || plantillaId === null) return;
        const current = linksMap.get(tipoId) || [];
        if (!current.includes(plantillaId)) {
          current.push(plantillaId);
        }
        linksMap.set(tipoId, current);
      });

      setPlantillaIdsByTipoExpediente(linksMap);
    } catch (err) {
      console.error(
        "Error cargando TipoExpediente_plantilla desde SharePoint:",
        err,
      );
      setPlantillaIdsByTipoExpediente(new Map());
    }
  };

  // Manejar cambios en carpetas de un expediente
  const handleCarpetasChange = (expedienteId: number, carpetas: string[]) => {
    const config = provisioningConfigs.get(expedienteId);
    if (config) {
      setProvisioningConfigs(
        new Map(
          provisioningConfigs.set(expedienteId, {
            ...config,
            carpetas,
          }),
        ),
      );
    }
  };

  // Cargar plantilla en un expediente
  const handleCargarPlantilla = (
    expedienteId: number,
    plantilla: IPlantillaAprovisionamiento,
  ) => {
    setProvisioningConfigs((prev) => {
      const next = new Map(prev);
      const config = next.get(expedienteId);
      if (!config) return prev;

      const plantillaAplicada = {
        carpetas: [...plantilla.carpetas],
        usarPlantilla: true,
        nombrePlantilla: plantilla.nombre,
        plantillaAprovisionamientoId: Number(plantilla.id),
        // Mantener el estado "No generar" del nodo padre
        noGenerarCarpetas: config.noGenerarCarpetas,
      };

      const updatedParent = {
        ...config,
        ...plantillaAplicada,
      };

      next.set(expedienteId, updatedParent);

      // Si el nodo raíz tiene marcado "Extender...", aplicamos también a todos los hijos
      if (updatedParent.extenderEstructuraAHijos) {
        const descendantIds = collectDescendantsIdsByParentId(
          expedienteTree,
          expedienteId,
        );
        descendantIds.forEach((childId) => {
          const childConfig = next.get(childId);
          if (!childConfig) return;
          next.set(childId, {
            ...childConfig,
            ...plantillaAplicada,
          });
        });
      }

      return next;
    });
  };

  // Guardar como plantilla
  const handleGuardarPlantilla = (
    expedienteId: number,
    nombrePlantilla: string,
  ) => {
    const config = provisioningConfigs.get(expedienteId);
    if (config && config.carpetas.length > 0) {
      const nuevaPlantilla: IPlantillaAprovisionamiento = {
        id: Date.now().toString(),
        nombre: nombrePlantilla,
        carpetas: config.carpetas,
      };
      setAllPlantillas([...allPlantillas, nuevaPlantilla]);
      // TODO: Guardar en API o localStorage
    }
  };

  // Toggle para no generar carpetas
  const handleToggleNoGenerarCarpetas = (expedienteId: number) => {
    setProvisioningConfigs((prev) => {
      const next = new Map(prev);
      const config = next.get(expedienteId);
      if (!config) return prev;

      const nuevoNoGenerar = !config.noGenerarCarpetas;
      const limpiarPlantilla = nuevoNoGenerar
        ? {
            usarPlantilla: false,
            nombrePlantilla: undefined,
            plantillaAprovisionamientoId: undefined,
            carpetas: [],
          }
        : {};

      const updatedParent = {
        ...config,
        noGenerarCarpetas: nuevoNoGenerar,
        ...limpiarPlantilla,
      };
      next.set(expedienteId, updatedParent);

      // Si el nodo raíz tiene activado el extender, propagar también el "No generar"
      if (updatedParent.extenderEstructuraAHijos) {
        const descendantIds = collectDescendantsIdsByParentId(
          expedienteTree,
          expedienteId,
        );
        descendantIds.forEach((childId) => {
          const childConfig = next.get(childId);
          if (!childConfig) return;
          next.set(childId, {
            ...childConfig,
            noGenerarCarpetas: nuevoNoGenerar,
            ...(nuevoNoGenerar
              ? {
                  usarPlantilla: false,
                  nombrePlantilla: undefined,
                  plantillaAprovisionamientoId: undefined,
                  carpetas: [],
                }
              : {}),
          });
        });
      }

      return next;
    });
  };

  // Toggle para extender la estructura de la plantilla a nodos hijos
  const handleToggleExtenderEstructuraAHijos = (
    expedienteId: number,
    checked: boolean,
  ) => {
    setProvisioningConfigs((prev) => {
      const next = new Map(prev);
      const config = next.get(expedienteId);
      if (!config) return prev;

      const descendantIds = collectDescendantsIdsByParentId(
        expedienteTree,
        expedienteId,
      );

      const updatedParent = {
        ...config,
        extenderEstructuraAHijos: checked,
      };
      next.set(expedienteId, updatedParent);

      if (checked) {
        // Guardamos el estado actual de los hijos para poder restaurarlo al desmarcar
        const snapshot = new Map<number, IProvisioningConfig>();
        descendantIds.forEach((childId) => {
          const childConfig = next.get(childId);
          if (!childConfig) return;
          snapshot.set(childId, { ...childConfig, carpetas: [...(childConfig.carpetas || [])] });
        });
        configsHijosAntesDeExtenderRef.current.set(expedienteId, snapshot);

        descendantIds.forEach((childId) => {
          const childConfig = next.get(childId);
          if (!childConfig) return;
          next.set(childId, {
            ...childConfig,
            carpetas: [...(updatedParent.carpetas || [])],
            usarPlantilla: updatedParent.usarPlantilla,
            nombrePlantilla: updatedParent.nombrePlantilla,
            plantillaAprovisionamientoId:
              updatedParent.plantillaAprovisionamientoId,
            noGenerarCarpetas: updatedParent.noGenerarCarpetas,
            patronNomenclaturaId: updatedParent.patronNomenclaturaId,
            tipoExpedienteId: updatedParent.tipoExpedienteId,
          });
        });
      } else {
        // Restauramos los valores que tenían los hijos antes de marcar el check
        const snapshot =
          configsHijosAntesDeExtenderRef.current.get(expedienteId);
        if (snapshot) {
          descendantIds.forEach((childId) => {
            const previousConfig = snapshot.get(childId);
            if (!previousConfig) return;
            next.set(childId, {
              ...previousConfig,
              carpetas: [...(previousConfig.carpetas || [])],
            });
          });
          configsHijosAntesDeExtenderRef.current.delete(expedienteId);
        }
      }

      return next;
    });
  };

  // Obtener estructura de carpetas de una plantilla desde la biblioteca
  // Configuracion -> Plantillas -> [nombrePlantilla]
  async function obtenerCarpetasPlantilla(nombrePlantilla: string) {
    const carpetas: string[] = [];

    const recorrer = async (serverRelativeUrl: string) => {
      const folder = sp.web.getFolderByServerRelativePath(serverRelativeUrl);
      const subFolders: any[] = await folder.folders
        .filter("Name ne 'Forms'")
        .select("Name,ServerRelativeUrl")
        .get();

      subFolders.sort((a, b) =>
        compareFoldersByLeadingNumber(
          String(a?.Name || ""),
          String(b?.Name || ""),
        ),
      );

      for (const sf of subFolders) {
        const srUrl = sf.ServerRelativeUrl as string;
        const rel = srUrl
          .split(`${nombrePlantilla}/`)[1]
          ?.replace(/^\/+|\/+$/g, "");
        if (rel && !carpetas.includes(rel)) {
          carpetas.push(rel);
        }
        await recorrer(srUrl);
      }
    };

    try {
      // Obtener la URL relativa completa de la carpeta raíz de la plantilla
      const rootFolder = await sp.web
        .getFolderByServerRelativePath(`Configuracion/Plantillas/${nombrePlantilla}`)
        .select("ServerRelativeUrl")
        .get();
      const rootUrl = rootFolder.ServerRelativeUrl as string;
      await recorrer(rootUrl);
    } catch (e) {
      console.error(
        "Error obteniendo estructura de carpetas para la plantilla:",
        nombrePlantilla,
        e,
      );
    }

    return carpetas;
  }

  React.useEffect(() => {
    void getData();
    void cargarPlantillas();
    void cargarTipoExpedientePlantillaLinks();
  }, []);

  const expedientesAAprovisionar = React.useMemo(() => {
    if (!expedienteTree.length) return [];

    const allNodes: IExpedienteTreeNode[] = [];
    const collectNodes = (nodes: IExpedienteTreeNode[]) => {
      nodes.forEach((n) => {
        allNodes.push(n);
        if (n.hijos && n.hijos.length) {
          collectNodes(n.hijos);
        }
      });
    };
    collectNodes(expedienteTree);

    return allNodes
      .filter(
        (n) =>
          !n.yaExiste &&
          hasTipoExpedienteSelected(
            provisioningConfigs.get(n.expediente.idexpediente),
          ),
      )
      .map((n) => {
        const config = provisioningConfigs.get(n.expediente.idexpediente);
        const tipoTitle =
          tiposExpediente.find(
            (t) => t.idTipoExpediente === Number(config?.tipoExpedienteId),
          )?.title || "—";
        const patronTitle =
          patronesNomenclatura.find(
            (p) => p.Id === Number(config?.patronNomenclaturaId),
          )?.Title || "—";
        let estructuraLabel = "Sin plantilla";
        if (config?.noGenerarCarpetas) {
          estructuraLabel = "No generar carpetas";
        } else if (config?.usarPlantilla && config.nombrePlantilla) {
          estructuraLabel = config.nombrePlantilla;
        }

        return {
          id: n.expediente.idexpediente,
          nemotecnico: n.expediente.nemotecnico || "—",
          titulo: n.expediente.titulo || "—",
          tipoTitle,
          patronTitle,
          estructuraLabel,
          nivel: n.nivel || 0,
          icon: getExpedientePrimaryIcon(n.expediente),
        };
      });
  }, [
    expedienteTree,
    provisioningConfigs,
    tiposExpediente,
    patronesNomenclatura,
  ]);

  if (isAuthorizedToCreate === false) return null;

  return (
    <section>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h2 className={styles.title}>Expediente a aprovisionar</h2>

        <div className={styles.selectorRow}>
          <div className={styles.selectorField}>
            <select
              className={styles.selectorSelect}
              value={form.idexpediente === 0 ? "" : form.idexpediente}
              onChange={(e) => {
                const value = e.target.value;
                const id = value ? Number(value) : 0;
                setForm((prev) => ({
                  ...prev,
                  idexpediente: id,
                }));
                setExp((prev) =>
                  prev
                    ? {
                        ...prev,
                        idexpediente: id,
                      }
                    : prev,
                );
                setExpedienteYaExiste(false);
                if (id) {
                  void handleSearchExp(id);
                }
              }}
            >
              <option value="">Selecciona un expediente del JSON</option>
              {expedientesSelect.map((exp) => (
                <option key={exp.idexpediente} value={exp.idexpediente}>
                  {exp.nemotecnico} - {exp.idexpediente} - {exp.titulo}
                </option>
              ))}
            </select>
            {errorExp && <p className={styles.expError}>{errorExp}</p>}
          </div>
        </div>
        {mostrarAprovisionamiento && expedienteTree.length > 0 && (
          <div className={styles.aprovisionamientoSection}>
            <h3 className={styles.sectionTitle}>
              Árbol de Expedientes y Aprovisionamiento
            </h3>
            <p className={styles.sectionDescription}>
              Configure la estructura de carpetas para cada expediente del
              árbol. Se creará una carpeta con el nombre del nemotécnico para
              cada expediente.
            </p>

            <div className={styles.expedienteTree}>
              {expedienteTree.map((nodo) => (
                <ExpedienteTreeNode
                  key={nodo.expediente.idexpediente}
                  nodo={nodo}
                  provisioningConfigs={provisioningConfigs}
                  allPlantillas={allPlantillas}
                  plantillaIdsByTipoExpediente={plantillaIdsByTipoExpediente}
                  patronesNomenclatura={patronesNomenclatura}
                  onCarpetasChange={handleCarpetasChange}
                  onCargarPlantilla={handleCargarPlantilla}
                  onGuardarPlantilla={handleGuardarPlantilla}
                  onToggleNoGenerar={handleToggleNoGenerarCarpetas}
                  onToggleExtenderEstructuraAHijos={
                    handleToggleExtenderEstructuraAHijos
                  }
                  carpetaDocumentacionTrabajo={carpetaDocumentacionTrabajo}
                  onPatronNomenclaturaChange={onPatronNomenclaturaChange}
                  patronNomenclaturaPorExpediente={
                    patronNomenclaturaPorExpediente
                  }
                  tipoExpedientePorExpediente={tipoExpedientePorExpediente}
                  tiposExpediente={tiposExpediente}
                  onTipoExpedienteChange={onTipoExpedienteChange}
                  rolesDisplay={
                    rolesDisplayByExpediente.get(
                      nodo.expediente.idexpediente,
                    ) || undefined
                  }
                  rolesDisplayByExpediente={rolesDisplayByExpediente}
                  isRoot={true}
                />
              ))}
            </div>
          </div>
        )}
        {saveSuccess && (
          <div className={styles.successMessage}>
            <p>✓ Expediente guardado exitosamente</p>
          </div>
        )}
        {saveError && (
          <div className={styles.errorMessage}>
            <p>✗ {saveError}</p>
          </div>
        )}
        {expedienteTree.length > 0 && (
          <div className={styles.provisioningSummary}>
            <div className={styles.provisioningSummaryHeader}>
              <span className={styles.provisioningSummaryIcon} aria-hidden="true">
                i
              </span>
              <div>
                <h3 className={styles.provisioningSummaryTitle}>
                  Expedientes que se van a aprovisionar
                </h3>
                <p className={styles.provisioningSummarySubtitle}>
                  {expedientesAAprovisionar.length === 0
                    ? "Todavía no hay expedientes listos. Seleccione el tipo de expediente en los nodos sin aprovisionar para incluirlos en el guardado."
                    : `Se aprovisionarán ${expedientesAAprovisionar.length} expediente${
                        expedientesAAprovisionar.length === 1 ? "" : "s"
                      }. Revise el resumen antes de confirmar.`}
                </p>
              </div>
            </div>
            {expedientesAAprovisionar.length > 0 && (
              <ul className={styles.provisioningSummaryList}>
                {expedientesAAprovisionar.map((item) => (
                  <li
                    key={item.id}
                    className={styles.provisioningSummaryItem}
                  >
                    <div className={styles.provisioningSummaryItemHeader}>
                      <span
                        className={styles.provisioningSummaryItemTreeIcon}
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                      <div className={styles.provisioningSummaryItemMain}>
                        <strong>
                          {item.nemotecnico}
                          <span className={styles.provisioningSummaryItemId}>
                            {" "}
                            (ID: {item.id})
                          </span>
                        </strong>
                        <span className={styles.provisioningSummaryItemTitle}>
                          {item.titulo}
                        </span>
                      </div>
                    </div>
                    <div className={styles.provisioningSummaryMeta}>
                      <span>
                        <em>Tipo de expediente:</em> {item.tipoTitle}
                      </span>
                      <span>
                        <em>Codificación:</em> {item.patronTitle}
                      </span>
                      {/* <span>
                        <em>Estructura:</em> {item.estructuraLabel}
                      </span> */}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className={styles.actions}>
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Guardando..." : "Guardar Expediente"}
          </button>
        </div>
      </form>
      {error && (
        <ErrorAlert message={error} onRetry={() => window.location.reload()} />
      )}
    </section>
  );
};

export default NewProject;
