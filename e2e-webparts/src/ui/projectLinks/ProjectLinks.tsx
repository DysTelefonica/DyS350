import * as React from "react";
import { sp } from "@pnp/sp";
import { WebPartContext } from "@microsoft/sp-webpart-base";
import styles from "./ProjectLinks.module.scss";

interface IProjectLinksProps {
  context: WebPartContext;
  projectId: string | null;
}

interface IProjectLinkItem {
  id: number;
  title: string;
  enlace: string;
}

const getLinkValue = (raw: unknown): string => {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  const asObj = raw as { Url?: string; Description?: string };
  return String(asObj.Url || asObj.Description || "").trim();
};

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const normalizeText = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase();

const escapeODataValue = (value: string): string => value.replace(/'/g, "''");

const getUserFieldEmail = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  const u = value as { EMail?: string; Email?: string; email?: string };
  return String(u.EMail || u.Email || u.email || "").trim();
};

const ProjectLinks: React.FC<IProjectLinksProps> = ({ context, projectId }) => {
  const [links, setLinks] = React.useState<IProjectLinkItem[]>([]);
  const [newTitle, setNewTitle] = React.useState<string>("");
  const [newLink, setNewLink] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [canManageLinks, setCanManageLinks] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  const loadLinks = React.useCallback(async () => {
    if (!projectId) {
      setLinks([]);
      return;
    }

    const projectNum = Number(projectId);
    // @ts-ignore
    if (Number.isNaN(projectNum)) {
      setLinks([]);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const items: any[] = await sp.web.lists
        .getByTitle("EnlacesExpediente")
        .items.filter(`IDExpediente eq ${projectNum}`)
        .select("ID", "Title", "Enlace")
        .orderBy("ID", false)
        .top(5000)
        .get();

      const mapped: IProjectLinkItem[] = items
        .map((it) => ({
          id: Number(it.ID) || 0,
          title: String(it.Title || "").trim(),
          enlace: getLinkValue(it.Enlace),
        }))
        .filter((it) => it.id > 0 && !!it.enlace && !!it.title);

      setLinks(mapped);
    } catch (e) {
      console.error("Error cargando enlaces del expediente:", e);
      setError("No se pudieron cargar los enlaces del expediente.");
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  React.useEffect(() => {
    const loadPermissions = async () => {
      if (!projectId) {
        setCanManageLinks(false);
        return;
      }

      const projectNum = Number(projectId);
      if (isNaN(projectNum)) {
        setCanManageLinks(false);
        return;
      }

      const currentName = String(context.pageContext.user.displayName || "").trim();
      const currentEmail = String(context.pageContext.user.email || "").trim();
      const currentNameNorm = normalizeText(currentName);
      const currentEmailNorm = normalizeText(currentEmail);
      const userFilters: string[] = [];
      if (currentName) {
        userFilters.push(`Title eq '${escapeODataValue(currentName)}'`);
      }
      if (currentEmail) {
        userFilters.push(`substringof('${escapeODataValue(currentEmail)}', usuario)`);
      }

      try {
        const rolesCatalogItems: any[] = await sp.web.lists
          .getByTitle("Roles")
          .items.filter(`Title eq 'Jefe de Proyecto'`)
          .select("IDRol")
          .top(1)
          .get();

        const jefeProyectoRolId =
          rolesCatalogItems.length > 0
            ? Number(rolesCatalogItems[0].IDRol)
            : NaN;
        if (isNaN(jefeProyectoRolId)) {
          setCanManageLinks(false);
          return;
        }

        const baseFilter = `IDExpediente eq ${projectNum} and IDRol eq ${jefeProyectoRolId}`;
        const rolesRaw: any[] = await sp.web.lists
          .getByTitle("Roles_usuario")
          .items.filter(
            userFilters.length > 0
              ? `${baseFilter} and (${userFilters.join(" or ")})`
              : baseFilter,
          )
          .select("Title", "usuario")
          .top(5000)
          .getAll();

        const hasPermission = rolesRaw.some((role) => {
          const roleNameNorm = normalizeText(role?.Title);
          const roleUserNorm = normalizeText(getUserFieldEmail(role?.usuario));
          const roleUserRawNorm = normalizeText(String(role?.usuario || ""));
          const byName = !!currentNameNorm && roleNameNorm === currentNameNorm;
          const byEmail =
            !!currentEmailNorm &&
            (roleUserNorm === currentEmailNorm ||
              roleUserRawNorm.indexOf(currentEmailNorm) >= 0);
          return byName || byEmail;
        });

        setCanManageLinks(hasPermission);
      } catch (e) {
        console.error("Error validando permisos de enlaces:", e);
        setCanManageLinks(false);
      }
    };

    void loadPermissions();
  }, [context.pageContext.user.displayName, context.pageContext.user.email, projectId]);

  const handleAddLink = async (): Promise<void> => {
    if (!projectId) return;

    const projectNum = Number(projectId);
    // @ts-ignore
    if (Number.isNaN(projectNum)) {
      setError("El ID del expediente no es válido.");
      return;
    }

    const titleValue = String(newTitle || "").trim();
    if (!titleValue) {
      setError("Debes introducir un título para el enlace.");
      return;
    }

    const urlValue = normalizeUrl(newLink);
    if (!urlValue) {
      setError("Debes introducir un enlace.");
      return;
    }

    try {
      // Validación básica del formato URL
      new URL(urlValue);
    } catch {
      setError("El enlace no tiene un formato válido.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await sp.web.lists.getByTitle("EnlacesExpediente").items.add({
        IDExpediente: projectNum,
        Title: titleValue,
        Enlace: urlValue,
      });
      setNewTitle("");
      setNewLink("");
      await loadLinks();
    } catch (e) {
      console.error("Error guardando enlace del expediente:", e);
      setError("No se pudo guardar el enlace. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLink = async (id: number): Promise<void> => {
    if (!id || deletingId !== null) return;
    try {
      setDeletingId(id);
      setError("");
      await sp.web.lists.getByTitle("EnlacesExpediente").items.getById(id).delete();
      await loadLinks();
    } catch (e) {
      console.error("Error eliminando enlace del expediente:", e);
      setError("No se pudo eliminar el enlace. Inténtalo de nuevo.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <h2>Enlaces del expediente</h2>
      </div>

      {canManageLinks && (
        <div className={styles.addRow}>
          <input
            type="text"
            value={newTitle}
            placeholder="Título del enlace"
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <input
            type="text"
            value={newLink}
            placeholder="https://..."
            onChange={(e) => setNewLink(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void handleAddLink()}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Agregar enlace"}
          </button>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.empty}>Cargando enlaces...</div>
      ) : links.length === 0 ? (
        <div className={styles.empty}>
          No hay enlaces registrados para este expediente.
        </div>
      ) : (
        <ul className={styles.list}>
          {links.map((link) => (
            <li key={link.id} className={styles.listItem}>
              <a href={link.enlace} target="_blank" rel="noreferrer noopener">
                <span className={styles.linkIcon} aria-hidden="true">
                  🔗
                </span>
                <span>{link.title}</span>
              </a>
              {canManageLinks && (
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => void handleDeleteLink(link.id)}
                  disabled={deletingId !== null}
                >
                  {deletingId === link.id ? "Eliminando..." : "Eliminar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ProjectLinks;
