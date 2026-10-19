import * as React from "react";
import { sp } from "@pnp/sp";
import styles from "./GeneralLinks.module.scss";
import type { IGeneralLinksProps } from "./IGeneralLinksProps";

interface IGeneralLinkItem {
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

const isKpisPage = (): boolean =>
  window.location.pathname.toLowerCase().indexOf("/sitepages/kpis.aspx") >= 0;

const DEFAULT_GENERAL_LINKS_TITLE = "Enlaces generales";
const DEFAULT_KPIS_LINKS_TITLE = "Enlaces KPIs";

const GeneralLinks: React.FC<IGeneralLinksProps> = ({
  context,
  hasTeamsContext,
  generalLinksTitle,
  kpisLinksTitle,
}) => {
  const kpisPage = isKpisPage();
  const listTitle = kpisPage ? "EnlacesKPIs" : "EnlacesGenerales";
  const sectionTitle = String(
    (kpisPage ? kpisLinksTitle : generalLinksTitle) ||
      (kpisPage ? DEFAULT_KPIS_LINKS_TITLE : DEFAULT_GENERAL_LINKS_TITLE),
  ).trim();
  const linksLabel = sectionTitle.toLowerCase();
  const [links, setLinks] = React.useState<IGeneralLinkItem[]>([]);
  const [newTitle, setNewTitle] = React.useState<string>("");
  const [newLink, setNewLink] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string>("");
  const isSharePointAdmin = !!(
    (context.pageContext as any)?.legacyPageContext?.isSiteAdmin ||
    (context.pageContext as any)?.legacyPageContext?.isWebAdmin
  );

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  const loadLinks = React.useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const items: any[] = await sp.web.lists
        .getByTitle(listTitle)
        .items.select("ID", "Title", "Enlace")
        .orderBy("ID", false)
        .top(5000)
        .get();

      const mapped: IGeneralLinkItem[] = items
        .map((it) => ({
          id: Number(it.ID) || 0,
          title: String(it.Title || "").trim(),
          enlace: getLinkValue(it.Enlace),
        }))
        .filter((it) => it.id > 0 && !!it.enlace && !!it.title);

      setLinks(mapped);
    } catch (e) {
      console.error(`Error cargando ${linksLabel}:`, e);
      setError(`No se pudieron cargar los ${linksLabel}.`);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [listTitle, linksLabel]);

  React.useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const handleAddLink = async (): Promise<void> => {
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
      new URL(urlValue);
    } catch {
      setError("El enlace no tiene un formato válido.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await sp.web.lists.getByTitle(listTitle).items.add({
        Title: titleValue,
        Enlace: urlValue,
      });
      setNewTitle("");
      setNewLink("");
      await loadLinks();
    } catch (e) {
      console.error("Error guardando enlace general:", e);
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
      await sp.web.lists
        .getByTitle(listTitle)
        .items.getById(id)
        .delete();
      await loadLinks();
    } catch (e) {
      console.error("Error eliminando enlace general:", e);
      setError("No se pudo eliminar el enlace. Inténtalo de nuevo.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      className={`${styles.generalLinks} ${hasTeamsContext ? styles.teams : ""}`}
    >
      <div className={styles.header}>
        <h2>{sectionTitle}</h2>
      </div>

      {isSharePointAdmin && (
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
          {`No hay ${linksLabel} registrados.`}
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
              {isSharePointAdmin && (
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

export default GeneralLinks;
