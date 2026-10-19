import { Version } from "@microsoft/sp-core-library";
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
} from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";
import * as React from "react";
import * as ReactDom from "react-dom";

import * as strings from "ProyectDetailWebPartStrings";
import { IProyectDetailProps } from "./components/IProyectDetailProps";
import ProyectDetail from "./components/ProyectDetail";

export interface IProyectDetailWebPartProps {
  description: string;
  /** Número de tareas por página en el listado. */
  itemsPerPage?: number;
}

export default class ProyectDetailWebPart extends BaseClientSideWebPart<IProyectDetailWebPartProps> {
  public render(): void {
    const itemsPerPage =
      typeof this.properties.itemsPerPage === "number"
        ? this.properties.itemsPerPage
        : parseInt(
            (this.properties.itemsPerPage as unknown as string) || "10",
            10,
          ) || 10;

    const element: React.ReactElement<IProyectDetailProps> =
      React.createElement(ProyectDetail, {
        context: this.context,
        itemsPerPage,
      });

    ReactDom.render(element, this.domElement);
  }

  // protected onInit(): Promise<void> {
  //   return this._getEnvironmentMessage().then(message => {
  //     this._environmentMessage = message;
  //   });
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
                  label: "Tareas por página (listado de tareas)",
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
