// @ts-nocheck
import * as React from "react";
import { sp } from "@pnp/sp";
import styles from "./NavBar.module.scss";
import { INavBarProps } from "./INavBarProps";

const NOTIFICATIONS_COUNT_STORAGE_KEY = "e2e.pendingNotificationsCount";
const NOTIFICATIONS_COUNT_TS_STORAGE_KEY = "e2e.pendingNotificationsCount.ts";
const NOTIFICATIONS_CACHE_TTL_MS = 3 * 60 * 1000;
const PLANNER_TEMPORAL_LIST = "PlannerTemporal";
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
const isPlannerPage = (): boolean =>
  window.location.pathname.toLowerCase().indexOf("/sitepages/planner.aspx") >= 0;

const syncPlannerTemporalFromUrl = async (userEmail: string): Promise<void> => {
  if (!isPlannerPage()) return;

  const planId = String(
    new URLSearchParams(window.location.search).get("PlanId") || "",
  ).trim();
  const email = String(userEmail || "").trim();
  if (!planId || !email) return;

  const existingItems: Array<{ Id?: number }> = await sp.web.lists
    .getByTitle(PLANNER_TEMPORAL_LIST)
    .items.filter(`Email eq '${escapeOData(email)}'`)
    .select("Id", "Email", "PlanId")
    .top(1)
    .get();

  if (existingItems.length > 0 && existingItems[0].Id) {
    await sp.web.lists
      .getByTitle(PLANNER_TEMPORAL_LIST)
      .items.getById(existingItems[0].Id)
      .update({ PlanId: planId });
    return;
  }

  await sp.web.lists.getByTitle(PLANNER_TEMPORAL_LIST).items.add({
    Title: email,
    Email: email,
    PlanId: planId,
  });
};

const isNotificationsMenuLink = (text: string, href: string): boolean => {
  const textNorm = normalize(text);
  const hrefNorm = String(href || "").toLowerCase();
  return (
    textNorm.indexOf("notificacion") >= 0 ||
    hrefNorm.indexOf("notificaciones.aspx") >= 0
  );
};

const isAdvancedSearchMenuLink = (text: string, href: string): boolean => {
  const textNorm = normalize(text);
  const hrefNorm = String(href || "").toLowerCase();
  return (
    textNorm.indexOf("buscador avanzado") >= 0 ||
    hrefNorm.indexOf("buscador-avanzado.aspx") >= 0
  );
};

const NavBar: React.FC<INavBarProps> = ({ context, links, pageUrl }) => {
  const getInitialOnlyMyProjects = (): boolean => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("projects");
    // Solo "my" activa el filtro de mis expedientes; por defecto mostramos todos
    return value === "my";
  };

  const [onlyMyProjects, setOnlyMyProjects] = React.useState(
    getInitialOnlyMyProjects(),
  );
  const _urlAssets = "SiteAssets/Img";
  const absolutePath = context.pageContext.web.absoluteUrl;
  const loggedUserName = context.pageContext.user.displayName || "Usuario";
  const [pendingNotificationsCount, setPendingNotificationsCount] =
    React.useState<number>(0);
  const userNameNorm = normalize(context.pageContext.user.displayName || "");
  const userEmailNorm = normalize(context.pageContext.user.email || "");

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  React.useEffect(() => {
    const userEmail = context.pageContext.user.email || "";
    syncPlannerTemporalFromUrl(userEmail).catch((error) => {
      console.error("Error sincronizando PlannerTemporal:", error);
    });
  }, [context, pageUrl]);

  React.useEffect(() => {
    const loadPendingCount = (forceRefresh = false): void => {
      const setAndCacheCount = (count: number): void => {
        const validCount = isNaN(count) || count < 0 ? 0 : count;
        setPendingNotificationsCount(validCount);
        localStorage.setItem(
          NOTIFICATIONS_COUNT_STORAGE_KEY,
          String(validCount),
        );
        localStorage.setItem(
          NOTIFICATIONS_COUNT_TS_STORAGE_KEY,
          String(Date.now()),
        );
      };

      const run = async (): Promise<void> => {
        try {
          const cachedRaw = localStorage.getItem(NOTIFICATIONS_COUNT_STORAGE_KEY);
          const cachedTsRaw = localStorage.getItem(
            NOTIFICATIONS_COUNT_TS_STORAGE_KEY,
          );
          const cachedCount = Number(cachedRaw || "0");
          const cachedTs = Number(cachedTsRaw || "0");
          const cacheIsValid =
            !forceRefresh &&
            isFinite(cachedCount) &&
            isFinite(cachedTs) &&
            cachedTs > 0 &&
            Date.now() - cachedTs <= NOTIFICATIONS_CACHE_TTL_MS;

          if (cacheIsValid) {
            setPendingNotificationsCount(cachedCount < 0 ? 0 : cachedCount);
            return;
          }

          const userDisplayName = context.pageContext.user.displayName || "";
          const userEmail = context.pageContext.user.email || "";

          if (!userDisplayName && !userEmail) {
            setAndCacheCount(0);
            return;
          }

          const rolesItems: Array<{ IDRol?: number | string }> =
            await sp.web.lists
              .getByTitle("Roles")
              .items.filter(`Title eq 'Jefe de Proyecto'`)
              .select("IDRol")
              .top(1)
              .get();
          const jefeProyectoRolId =
            rolesItems.length > 0 ? Number(rolesItems[0].IDRol) : NaN;

          const jefeProjectExpSet: Record<number, boolean> = {};
          if (!isNaN(jefeProyectoRolId)) {
            const userEscName = escapeOData(userDisplayName);
            const userEscEmail = escapeOData(userEmail);
            const rolesUsuarioItems: Array<{ IDExpediente?: number | string }> =
              await sp.web.lists
                .getByTitle("Roles_usuario")
                .items.filter(
                  `IDRol eq ${jefeProyectoRolId} and (Title eq '${userEscName}' or substringof('${userEscEmail}', usuario))`,
                )
                .select("IDExpediente")
                .top(2000)
                .get();
            rolesUsuarioItems.forEach((r) => {
              const expId = Number(r.IDExpediente);
              if (isFinite(expId) && expId > 0) jefeProjectExpSet[expId] = true;
            });
          }

          const revisionesPend: Array<{
            IDTareaDocumental?: number | string;
            Title?: string;
            IDRevisor?: string;
          }> = await sp.web.lists
            .getByTitle("Revisiones")
            .items.filter(`EstadoRevision eq 'Pendiente'`)
            .select("IDTareaDocumental", "Title", "IDRevisor")
            .top(2000)
            .get();

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

          const firmasPend: Array<{
            IDTareaDocumental?: number | string;
            Title?: string;
            IDFirmante?: string;
          }> = await sp.web.lists
            .getByTitle("Firmas")
            .items.filter(`EstadoFirma eq 'Pendiente'`)
            .select("IDTareaDocumental", "Title", "IDFirmante")
            .top(2000)
            .get();

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

          const tareas: Array<{
            IDTarea?: number | string;
            EstadoTarea?: string;
            Responsable?: string;
            Elaborador?: string;
            IDProyecto?: number | string;
            FechaDeadline?: string;
            EsEntregable?: boolean;
            FechaEntrega?: string;
          }> = await sp.web.lists
            .getByTitle("TareasDocumentales")
            .items.select(
              "IDTarea",
              "EstadoTarea",
              "Responsable",
              "Elaborador",
              "IDProyecto",
              "FechaDeadline",
              "EsEntregable",
              "FechaEntrega",
            )
            .top(2000)
            .get();

          let flowCount = 0;
          let nearDeadlineCount = 0;
          let pendingDeliveryCount = 0;
          const now = new Date();
          const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

          tareas.forEach((t) => {
            const idTarea = Number(t.IDTarea);
            if (!isFinite(idTarea) || idTarea <= 0) return;

            const estado = String(t.EstadoTarea || "");
            const responsable = String(t.Responsable || "");
            const elaboradorRaw = String(t.Elaborador || "");
            const deadlineRaw = t.FechaDeadline ? String(t.FechaDeadline) : "";
            const expId = Number(t.IDProyecto || 0);
            const esEntregable = !!t.EsEntregable;
            const fechaEntrega = t.FechaEntrega ? String(t.FechaEntrega) : "";

            if (normalize(estado) === "enrevision") {
              if (revisionTaskSet[idTarea]) {
                flowCount += 1;
              }
            } else if (
              normalize(estado) === "enfirma" &&
              firmaTaskSet[idTarea]
            ) {
              flowCount += 1;
            }

            const isResp = normalize(responsable) === userNameNorm;
            const isElab = isUserInElaboradores(
              elaboradorRaw,
              userNameNorm,
              userEmailNorm,
            );
            const isJefeProyecto = !!jefeProjectExpSet[expId];
            const userRelated = isResp || isElab || isJefeProyecto;

            if (userRelated && deadlineRaw && !isFinalState(estado)) {
              const d = new Date(deadlineRaw);
              if (!isNaN(d.getTime()) && d >= now && d <= weekAhead) {
                nearDeadlineCount += 1;
              }
            }

            if (
              userRelated &&
              esEntregable &&
              !fechaEntrega &&
              normalize(estado) === "versionado"
            ) {
              pendingDeliveryCount += 1;
            }
          });

          setAndCacheCount(
            flowCount + nearDeadlineCount + pendingDeliveryCount,
          );
        } catch (error) {
          console.error("Error cargando contador de notificaciones:", error);
          const rawCount = localStorage.getItem(
            NOTIFICATIONS_COUNT_STORAGE_KEY,
          );
          const parsed = Number(rawCount || "0");
          setPendingNotificationsCount(
            isNaN(parsed) || parsed < 0 ? 0 : parsed,
          );
        }
      };

      run().catch(() => {
        // El error ya se maneja dentro de run.
      });
    };

    const onStorage = (ev: StorageEvent): void => {
      if (ev.key !== NOTIFICATIONS_COUNT_STORAGE_KEY) return;
      const parsed = Number(ev.newValue || "0");
      setPendingNotificationsCount(isNaN(parsed) || parsed < 0 ? 0 : parsed);
    };
    const onNotificationsUpdated = (): void => loadPendingCount(false);

    loadPendingCount(false);
    window.addEventListener("storage", onStorage);
    window.addEventListener("notifications-count-updated", onNotificationsUpdated);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "notifications-count-updated",
        onNotificationsUpdated,
      );
    };
  }, [context, userNameNorm, userEmailNorm]);

  const handleProjects = (): void => {
    const nextValue = !onlyMyProjects;
    setOnlyMyProjects(nextValue);

    const params = new URLSearchParams(window.location.search);
    params.set("projects", nextValue ? "my" : "all");

    const query = params.toString();
    const hash = window.location.hash || "";
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ""}${hash}`;

    // Navegar a la URL final evita condiciones de carrera entre replaceState y reload.
    window.location.assign(newUrl);
  };

  const currentPath = React.useMemo(
    () =>
      String(pageUrl || window.location.pathname || "")
        .split("?")[0]
        .replace(/\/$/, "")
        .toLowerCase(),
    [pageUrl],
  );

  const isActiveMenuLink = (href: string): boolean => {
    try {
      const linkPath = new URL(href, absolutePath).pathname
        .replace(/\/$/, "")
        .toLowerCase();
      return linkPath === currentPath;
    } catch {
      return false;
    }
  };

  const menuLinks = React.useMemo(
    () =>
      (links || [])
        .map((link) => ({
          text: String(link.text || "").trim(),
          href: String(link.href || "").trim(),
        }))
        .filter((link) => link.text && link.href),
    [links],
  );

  const primaryMenuLinks = React.useMemo(
    () =>
      menuLinks.filter(
        (link) => !isAdvancedSearchMenuLink(link.text, link.href),
      ),
    [menuLinks],
  );

  const advancedSearchHref = React.useMemo(() => {
    // @ts-ignore
    const fromMenu = menuLinks.find((link) =>
      isAdvancedSearchMenuLink(link.text, link.href),
    );
    return (
      fromMenu?.href ||
      `${absolutePath}/SitePages/buscador-avanzado.aspx`
    );
  }, [menuLinks, absolutePath]);

  return (
    <nav className={styles.menu}>
      <div className={styles.menuTop}>
        <div className={styles.menuLeft}>
          <a href="#">
            <img
              src={`${absolutePath}/${_urlAssets}/LogoTelefonicaBlanco.png`}
              alt="Logo"
              className={styles.logo}
            />
          </a>
          <img
            src={`${absolutePath}/${_urlAssets}/Logo E2E.png`}
            alt="Logo"
            className={styles.logo}
          />
          {/* <span className={styles.title}>DyS 350</span> */}
        </div>

        <div className={styles.menuRight}>
          <div className={styles.projectsToggle}>
            <span
              className={`${styles.toggleLabel} ${
                onlyMyProjects ? styles.active : ""
              }`}
            >
              Mis expedientes
            </span>

            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={!onlyMyProjects}
                onChange={handleProjects}
              />
              <span className={styles.slider}></span>
            </label>

            <span
              className={`${styles.toggleLabel} ${
                !onlyMyProjects ? styles.active : ""
              }`}
            >
              Todos los expedientes
            </span>
          </div>

          <div className={styles.userAvatar}>
            {/* <img src={require("./img/user.svg")} alt="Usuario" /> */}
            <img
              src={`${absolutePath}/${_urlAssets}/user.svg`}
              alt="Usuario"
              // className={styles.logo}
            />
            <span>{loggedUserName}</span>
          </div>
        </div>
      </div>

      {/* MENÚ SECUNDARIO */}
      <div className={styles.menuSecondary}>
        <ul>
          {primaryMenuLinks.map((link) => (
            <li key={`${link.href}-${link.text}`}>
              <a
                href={link.href}
                className={isActiveMenuLink(link.href) ? styles.active : ""}
              >
                {link.text}
                {isNotificationsMenuLink(link.text, link.href) &&
                  pendingNotificationsCount > 0 && (
                    <span
                      style={{
                        display: "inline-block",
                        minWidth: "18px",
                        height: "18px",
                        marginLeft: "6px",
                        padding: "2px",
                        borderRadius: "999px",
                        backgroundColor: "#dc2626",
                        color: "#ffffff",
                        fontSize: "11px",
                        fontWeight: 700,
                        lineHeight: "18px",
                        textAlign: "center",
                      }}
                    >
                      {pendingNotificationsCount}
                    </span>
                  )}
              </a>
            </li>
          ))}
        </ul>
        <a
          href={advancedSearchHref}
          className={`${styles.advancedSearchLink} ${
            isActiveMenuLink(advancedSearchHref) ? styles.active : ""
          }`}
        >
          <svg
            className={styles.advancedSearchIcon}
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="currentColor"
              d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <span>Buscador avanzado</span>
        </a>
      </div>
    </nav>
  );
};

export default NavBar;
