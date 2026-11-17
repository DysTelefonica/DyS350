import {
  //Web,
  sp,
} from "@pnp/sp";
// import { includes } from "lodash";

export interface ILink {
  href: string;
  text: string;
}

const buildMenuHref = (absolutePath: string, urlPart: string): string => {
  const base = String(absolutePath || "").replace(/\/$/, "");
  const cleanUrl = String(urlPart || "")
    .trim()
    .replace(/^\/+/, "");
  if (!cleanUrl) return base;
  if (/^https?:\/\//i.test(cleanUrl)) return cleanUrl;

  const pagePath =
    cleanUrl.toLowerCase().indexOf("sitepages/") === 0
      ? cleanUrl
      : `SitePages/${cleanUrl}`;

  return `${base}/${pagePath}`;
};

export const getLinks = async (
  currentPath: string,
  absolutePath: string
): Promise<ILink[]> => {
  const links: ILink[] = [];
  // let listName: string;

  const listName = "MenuPrincipal";

  console.log("ENTRANDO A getLinks");
  // Extraer el path sin el nombre del sitio
  // const relativePath = currentPath.replace(/^\/sites\/[^\/]+\//, '');

  // // Selecciona la lista basada en currentPath
  // if (includes(relativePath,'Preguntanos/') || includes(relativePath,'MisConsultas')) {
  //   listName = 'MenuConsultas';
  // } else {
  //   listName = 'MenuPrincipal';
  // }

  try {
    const items = await sp.web.lists.getByTitle(listName).items.getAll();

    // Procesa los elementos de la lista para obtener los enlaces
    const currentUserGroups = await getUserGroups();
    const permittedGroups = [
      "Responsables",
      "Aprobadores",
      "Administrador Global",
    ];
    let hasPermissions = false;
    currentUserGroups.forEach((group) => {
      if (permittedGroups.indexOf(group) >= 0) {
        hasPermissions = true;
      }
    });
    items.forEach((item) => {
      if (item.Title === "Panel de control" && !hasPermissions) {
        return;
      }

      const urlPart = String(item.URL || "").trim();
      if (!urlPart) return;

      links.push({
        href: buildMenuHref(absolutePath, urlPart),
        text: String(item.Title || "").trim(),
      });
    });
  } catch (error) {
    console.error(`Error fetching items from list ${listName}: `, error);
  }

  return links;
};

export async function getUserGroups(): Promise<string[]> {
  // const _sp = spfi().using(SPFx(_context));
  try {
    // Obtener el usuario por su email
    const groups = await sp.web.currentUser.groups.get();

    // const user = await sp.web.siteUsers.getByEmail(userEmail)();

    // // Obtener los grupos a los que pertenece el usuario
    // const groups = await sp.web.siteUsers.getById(user.Id).groups();

    // // Retornar una lista con los nombres de los grupos
    const groupNames = groups.map((group) => group.Title);
    // return groupNames;
    return groupNames;
  } catch (error) {
    console.error("Error al obtener los grupos del usuario:", error);
    return error;
  }
}
