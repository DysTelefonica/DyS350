# Guía de consulta operativa

## About this copy

Searchable transcription of the development team's Spanish manual, not a new procedure or a verification of the deployed application.

- Snapshot added: **2026-10-30** (repository import date, not the document's publication date).
- Supplied file: [Guia_consulta_operativa.docx](../reference/Guia_consulta_operativa.docx), preserved byte for byte.
- SHA-256: `6EA665395BE07C5A1ACB412A542CE3280A506BAFFD440D39A3CE632390F7710B`.
- Ongoing source: [SharePoint DOC IT](https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF/Documentos%20compartidos/Forms/AllItems.aspx?id=%2Fsites%2FDyS350%2Eprod%2EOCETF%2FDocumentos%20compartidos%2FDOC%20IT&viewid=1d5892bd%2Dc6dd%2D4264%2D8363%2Debfcb50793ad), requiring an authenticated corporate account.
- The SharePoint folder contains a file with this name; its contents/version have **not** been compared with the supplied file. No automatic synchronization is configured.

The Spanish content below is transcribed in source order, preserving all body text, headings, lists and the notification table. This English introduction and the contents links are repository navigation, not part of the manual. Word pagination, typography and the repeated title footer are not reproduced. No body images or diagrams were present in the supplied file. Consult the unchanged DOCX for its original presentation; no rendered visual QA was performed.

For updates and conflicting evidence, follow the [documentation hub](../README.md#keeping-references-current).

## Contents

- [Carga del JSON y roles de Preventa](#1-carga-del-json-y-roles-de-preventa)
- [Notificaciones](#2-notificaciones)
- [Estructura documental y permisos](#3-estructura-documental-y-permisos)
- [Método de diagnóstico](#4-método-de-diagnóstico)
- [Resumen de rutas](#resumen-de-rutas)

---

<!-- BEGIN MANUAL BODY: source title is the document heading above. -->

Carga JSON, notificaciones, estructura documental y permisos

Este documento indica dónde consultar la información ante una incidencia. El objetivo es identificar el recurso afectado y revisar la evidencia en SharePoint y Power Automate, sin realizar cambios durante el diagnóstico.

## 1. Carga del JSON y roles de Preventa

### Dónde consultar el archivo de entrada

En el sitio SharePoint del entorno correspondiente (CERT o PRO):

Contenido del sitio > cargaJSON_entrada

Esta es la biblioteca de entrada. No se deben usar como entrada cargaJSON_procesados, cargaJSON_fallidos ni cargaJSON_log, ya que son bibliotecas de salida y trazabilidad.

### Dónde revisar el resultado

Contenido del sitio > Roles_usuario

Filtrar por el IDExpediente afectado y revisar:

- Nombre: Title.
- Correo: usuario.
- Rol: IDRol.
- Expediente: IDExpediente.

Si el JSON llega con esPreventa = No, puede seguir visible un registro previo de Preventa. Por ello se comprueba el contenido del JSON y el resultado final en Roles_usuario.

### Dónde revisar la ejecución

make.powerautomate.com > Entorno correspondiente > Soluciones > solución E2E

Abrir el flujo E2E_AltaExpedientes y su Historial de ejecuciones.

La ejecución permite comprobar la hora de carga, el valor recibido para esPreventa y el procesamiento posterior en E2E_AltaExpedientes_Modulo1, que crea o actualiza los roles.

## 2. Notificaciones

### Comprobación previa en SharePoint

Contenido del sitio > TareasDocumentales

Buscar por título, ID de tarea o expediente. Revisar:

- EstadoTarea y Estado.
- Elaborador.
- ListaAprobadores.
- ListaFirmantes.

Después, comprobar en Roles_usuario que las personas implicadas existen para ese expediente y que Title y usuario contienen el nombre y correo correctos.

Una causa habitual de que no llegue un correo es que el nombre almacenado en la tarea no coincida exactamente con Roles_usuario.Title por tildes, espacios, mayúsculas o varios nombres en un mismo campo.

### Flujo que revisar según el síntoma

| Caso | Flujo |
| --- | --- |
| Alta, revisión, aprobación, firma inicial o archivado | E2E_AltaTareaDocumento |
| Una revisión no avanza | E2E_RevisionesTareaDocumental |
| Firma individual, última firma o aviso posterior | E2E_FirmasTareaDocumental |
| Recordatorios | E2E_RecordatorioTareaDocumental |

En el Historial de ejecuciones, localizar la hora aproximada, abrir la acción de envío de correo y comprobar el destinatario calculado. Si queda vacío, revisar primero Roles_usuario.

### Consulta de firmas

Contenido del sitio > Firmas

Esta lista muestra cada firmante y el EstadoFirma. El valor utilizado para una firma completada es Aprobado.

## 3. Estructura documental y permisos

### Bibliotecas documentales

Contenido del sitio > DocumentacionTrabajo

Contiene los documentos operativos del expediente.

Contenido del sitio > DocumentacionArchivo

Contiene los documentos finales. Habitualmente los usuarios de negocio disponen de acceso de lectura.

### Datos que se deben pedir ante un error

- Expediente afectado.
- Biblioteca: DocumentacionTrabajo o DocumentacionArchivo.
- Ruta completa de la carpeta o documento.
- Usuario afectado.
- Fecha y hora aproximada.
- Captura de pantalla, mensaje o URL del error.

Con esos datos, abrir la carpeta o documento exacto y seleccionar: … > Administrar acceso (o Avanzado). Comprobar si hereda permisos o tiene permisos propios.

Un usuario puede aparecer en Roles_usuario y no tener permisos efectivos en la carpeta. El rol funcional y el permiso SharePoint son comprobaciones distintas.

### Consulta del aprovisionamiento

make.powerautomate.com > Entorno correspondiente > Soluciones > E2E_AltaExpedientesAprovisionamiento > Historial de ejecuciones

Este flujo crea la estructura de carpetas y asigna permisos. Se activa al crearse un elemento en la lista Expedientes. La creación o actualización de ExpedientesJSON, por sí sola, no implica que se haya ejecutado el aprovisionamiento.

## 4. Método de diagnóstico

1. Identificar el expediente, usuario, recurso exacto y hora del error.
2. Consultar primero SharePoint: JSON, lista, biblioteca, carpeta o documento afectado.
3. Revisar después el Historial de ejecuciones del flujo asociado.
4. Distinguir si la incidencia está en carga JSON, roles, permisos, notificaciones o aprovisionamiento.

Una captura sin la ruta o la URL del recurso puede no permitir distinguir si el error procede de una lista, una biblioteca, una carpeta o un documento.

## Resumen de rutas

- Entrada JSON: SharePoint > Contenido del sitio > cargaJSON_entrada.
- Roles: SharePoint > Contenido del sitio > Roles_usuario.
- Tareas: SharePoint > Contenido del sitio > TareasDocumentales.
- Firmas: SharePoint > Contenido del sitio > Firmas.
- Documentos: SharePoint > Contenido del sitio > DocumentacionTrabajo / DocumentacionArchivo.
- Flujos: Power Automate > Entorno > Soluciones > solución E2E > Historial de ejecuciones.

<!-- END MANUAL BODY -->
