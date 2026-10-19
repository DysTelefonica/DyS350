import { Version } from "@microsoft/sp-core-library";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
} from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";
// import { sp } from "@pnp/sp";
import * as strings from "ProyectListWebPartStrings";
import * as React from "react";
import * as ReactDom from "react-dom";
import { IProyectListProps } from "./components/IProyectListProps";
import ProyectList from "./components/ProyectList";

export interface IProyectListWebPartProps {
  description: string;
  /** Número de expedientes por página en la tabla. */
  itemsPerPage?: number;
}

export default class ProyectListWebPart extends BaseClientSideWebPart<IProyectListWebPartProps> {
  public render(): void {
    const itemsPerPage =
      typeof this.properties.itemsPerPage === "number"
        ? this.properties.itemsPerPage
        : parseInt(
            (this.properties.itemsPerPage as unknown as string) || "10",
            10,
          ) || 10;

    const element: React.ReactElement<IProyectListProps> = React.createElement(
      ProyectList,
      { context: this.context, itemsPerPage },
    );

    ReactDom.render(element, this.domElement);
  }

  // protected onInit(): Promise<void> {
  //   sp.setup({
  //     spfxContext: this.context,
  //   });
  //   return Promise.resolve();
  // }

  // private _getEnvironmentMessage(): Promise<string> {
  //   if (!!this.context.sdks.microsoftTeams) { // running in Teams, office.com or Outlook
  //     return this.context.sdks.microsoftTeams.teamsJs.app.getContext()
  //       .then(context => {
  //         let environmentMessage: string = '';
  //         switch (context.app.host.name) {
  //           case 'Office': // running in Office
  //             environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentOffice : strings.AppOfficeEnvironment;
  //             break;
  //           case 'Outlook': // running in Outlook
  //             environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentOutlook : strings.AppOutlookEnvironment;
  //             break;
  //           case 'Teams': // running in Teams
  //           case 'TeamsModern':
  //             environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentTeams : strings.AppTeamsTabEnvironment;
  //             break;
  //           default:
  //             environmentMessage = strings.UnknownEnvironment;
  //         }

  //         return environmentMessage;
  //       });
  //   }

  //   return Promise.resolve(this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentSharePoint : strings.AppSharePointEnvironment);
  // }

  // protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
  //   if (!currentTheme) {
  //     return;
  //   }

  //   this._isDarkTheme = !!currentTheme.isInverted;
  //   const {
  //     semanticColors
  //   } = currentTheme;

  //   if (semanticColors) {
  //     this.domElement.style.setProperty('--bodyText', semanticColors.bodyText || null);
  //     this.domElement.style.setProperty('--link', semanticColors.link || null);
  //     this.domElement.style.setProperty('--linkHovered', semanticColors.linkHovered || null);
  //   }

  // }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse("1.0");
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: strings.PropertyPaneDescription,
          },
          groups: [
            {
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField("description", {
                  label: strings.DescriptionFieldLabel,
                }),
                PropertyPaneTextField("itemsPerPage", {
                  label: "Expedientes por página",
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
