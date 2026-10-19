// import { Log } from '@microsoft/sp-core-library';
// import { Dialog } from '@microsoft/sp-dialog';
import * as React from "react";
import * as ReactDOM from "react-dom";
import { override } from "@microsoft/decorators";
import {
  BaseApplicationCustomizer,
  PlaceholderContent,
  PlaceholderName,
} from "@microsoft/sp-application-base";

// import * as strings from 'E2eBrandingApplicationCustomizerStrings';
import * as $ from "jquery";
import { Web, sp, PermissionKind } from "@pnp/sp";
// import { SPHttpClient } from "@microsoft/sp-http";
import NavBar from "./components/NavBar/Navbar";
import { getLinks } from "../../services/Services";
import { INavBarProps } from "./components/NavBar/INavBarProps";
import styles from "./E2eBrandingApplicationCustomizer.module.scss";
require("./pane.css");

// const LOG_SOURCE: string = 'E2eBrandingApplicationCustomizer';

/**
 * If your command set uses the ClientSideComponentProperties JSON input,
 * it will be deserialized into the BaseExtension.properties object.
 * You can define an interface to describe it.
 */
export interface IE2eBrandingApplicationCustomizerProperties {
  // This is an example; replace with your own property
  testMessage: string;
}

/** A Custom Action which can be run during execution of a Client Side Application */
export default class E2eBrandingApplicationCustomizer extends BaseApplicationCustomizer<IE2eBrandingApplicationCustomizerProperties> {
  private readonly _urlSitio = `${window.location.protocol}//${
    window.location.host
  }/${window.location.pathname.split("/")[1]}/${
    window.location.pathname.split("/")[2]
  }/`;
  private readonly _sitio = new Web(this._urlSitio);
  private placeholder: PlaceholderContent | undefined;

  private _isAdmin: boolean = false;
  @override
  public async onInit(): Promise<void> {
    sp.setup({
      spfxContext: this.context,
    });

    // Añade una clase personalizada al body
    document.body.classList.add(styles.customBody);

    // this.HideSharePointHeader();
    // this.HideSharePointComments();
    // this.ModifyCanvasZone();
    // this.HideSharePointFeedback();
    // this.HideSharepointFooter();
    // this.HideSharePointPublishedText();

    // //Verifica si el usuario es admin del sitio o del tenant
    // this._isAdmin = await this.isCurrentUserAdmin();

    // // Si no es admin, oculta barra de SharePoint, barra de edición y barra de aplicaciones
    // if (!this._isAdmin) {
    //   this.HideSharePointSuiteNavWrapper();
    //   this.HideSharePointEditBar();
    //   this.HideSharePointAppBar();
    // }

    // const placeholder: PlaceholderContent | undefined = this.context.placeholderProvider.tryCreateContent(PlaceholderName.Top);

    // Escuchar el evento navigatedEvent para actualizar la barra de navegación en cambios de página
    // this.context.application.navigatedEvent.add(this, this.renderNavBar.bind(this));
    this.context.application.navigatedEvent.add(this, this.loadAll.bind(this));

    // // Renderiza el menú por primera vez
    // await this.renderNavBar();

    return Promise.resolve();
  }

  public async loadAll(): Promise<void> {
    this.HideSharePointHeader();
    this.HideSharePointComments();
    this.ModifyCanvasZone();
    this.HideSharePointFeedback();
    this.HideSharepointFooter();
    this.HideSharePointPublishedText();

    //Verifica si el usuario es admin del sitio o del tenant
    this._isAdmin = await this.isCurrentUserAdmin();

    // Si no es admin, oculta barra de SharePoint, barra de edición y barra de aplicaciones
    if (!this._isAdmin) {
      this.HideSharePointSuiteNavWrapper();
      this.HideSharePointEditBar();
      this.HideSharePointAppBar();
    }

    // Renderiza el menú por primera vez
    await this.renderNavBar();

    return Promise.resolve();
  }

  private async renderNavBar() {
    let enlaces = await getLinks(window.location.pathname, this._urlSitio);
    // Si el placeholder no está creado, créalo
    if (!this.placeholder) {
      this.placeholder = this.context.placeholderProvider.tryCreateContent(
        PlaceholderName.Top
      );
    }

    if (this.placeholder) {
      const element: React.ReactElement<INavBarProps> = React.createElement(
        NavBar,
        {
          context: this.context,
          links: enlaces,
          pageUrl: `${window.location.pathname}${window.location.search}`,
        }
      );

      // Renderiza el menú en el placeholder
      ReactDOM.render(element, this.placeholder.domElement);
    }
  }

  //Verifica si el usuario actual es admin del sitio o del tenant
  private async isCurrentUserAdmin(): Promise<boolean> {
    try {
      const currentUser = await this._sitio.currentUser.get();

      const [ownerGroup, userEffectivePermissions] = await Promise.all([
        this._sitio.associatedOwnerGroup
          .select("Users/Id")
          .expand("Users")
          .get(),
        this._sitio.getUserEffectivePermissions(currentUser.LoginName),
      ]);

      const owners = ownerGroup.Users || [];
      const isOwner = owners.some(
        (user: { Id: number }) => user.Id === currentUser.Id
      );
      const hasFullControl = this._sitio.hasPermissions(
        userEffectivePermissions,
        PermissionKind.ManageWeb
      );

      return isOwner || hasFullControl;
    } catch (error) {
      console.error("Error checking if user is admin:", error);
      return false;
    }
  }

  public async HideSharePointPublishedText(): Promise<void> {
    const timerHead = setInterval(() => {
      const publishedEl = document.querySelector(
        '[data-automation-text="Published"]'
      );
      const button = $("button[data-automation-text^='Published']");
      if (button.length > 0) {
        if (publishedEl instanceof HTMLElement) {
          publishedEl.style.display = "none";
          button.hide();
          clearInterval(timerHead);
        }
      }
    }, 100);

    setTimeout(() => {
      const publishedEl = document.querySelector(
        '[data-automation-text="Published"]'
      );
      const button = $("button[data-automation-text^='Published']");
      if (button.length > 0) {
        if (publishedEl instanceof HTMLElement) {
          publishedEl.style.display = "none";
          button.hide();
          clearInterval(timerHead);
        }
      }
    }, 1000);
  }

  public async HideSharePointHeader(): Promise<void> {
    const timerHead = setInterval(() => {
      const banner = $("div").find("[class^='topPlaceholderRow-']");
      const banner2 = $("div").find("[class^='headerRow-']");
      if (banner.length > 0) {
        banner.hide();
        banner2.hide();
        clearInterval(timerHead);
      }
    }, 100);
  }

  public async HideSharePointSuiteNavWrapper(): Promise<void> {
    const timerHead = setInterval(() => {
      const navWrapper = $("div").find("[id^='SuiteNavWrapper']");
      if (navWrapper.length > 0) {
        navWrapper.hide();
        clearInterval(timerHead);
      }
    }, 100);
  }

  public async HideSharePointComments(): Promise<void> {
    const timerHead = setInterval(() => {
      const banner = $("div").find("[id^='CommentsWrapper']");
      if (banner.length > 0) {
        banner.hide();
        clearInterval(timerHead);
      }
    }, 100);
  }

  public async HideSharePointFeedback(): Promise<void> {
    const timerHead = setInterval(() => {
      const banner = $("div").find("[class^='feedback_0e1cf215']");
      if (banner.length > 0) {
        banner.hide();
        clearInterval(timerHead);
      }
    }, 100);
  }

  public async HideSharePointEditBar(): Promise<void> {
    const timerHead = setInterval(() => {
      const spCommandBar = $("div").find("[id^='spCommandBar']");
      if (spCommandBar.length > 0) {
        spCommandBar.hide();
        clearInterval(timerHead);
      }
    }, 100);
  }

  public async HideSharePointAppBar(): Promise<void> {
    const timerHead = setInterval(() => {
      const banner = $("div").find("[id^='sp-appBar']");
      if (banner.length > 0) {
        banner.hide();
        clearInterval(timerHead);
      }
    }, 100);
  }

  public async ModifyCanvasZone(): Promise<void> {
    const timerHead = setInterval(() => {
      const banner = $("div").find("[data-drag-tag='CanvasZone']");
      if (banner.length > 0) {
        banner.attr("style", "padding-right: 0 !important");
        clearInterval(timerHead);
      }
    }, 100);
  }

  public async HideSharepointFooter(): Promise<void> {
    const timerHead = setInterval(() => {
      const footer = $("footer");
      if (footer.length > 0) {
        footer.hide();
        clearInterval(timerHead);
      }
    }, 100);
  }

  public onDispose(): void {
    if (this.placeholder) {
      ReactDOM.unmountComponentAtNode(this.placeholder.domElement);
    }
    this.context.application.navigatedEvent.remove(
      this,
      this.loadAll.bind(this)
    );
  }
}
