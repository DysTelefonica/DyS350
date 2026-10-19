import * as React from "react";
import { sp } from "@pnp/sp";
import styles from "./Planner.module.scss";
import type { IPlannerProps } from "./IPlannerProps";

const JEFE_PROYECTO_ROL_ID = 2;

const escapeODataValue = (value: string): string => value.replace(/'/g, "''");

const normalize = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase();

const Planner: React.FC<IPlannerProps> = ({ context, hasTeamsContext }) => {
  const [loading, setLoading] = React.useState(true);
  const [planIdInput, setPlanIdInput] = React.useState("");
  const [isJefeProyecto, setIsJefeProyecto] = React.useState(false);
  const [expedienteListItemId, setExpedienteListItemId] = React.useState<
    number | null
  >(null);
  const [idExpediente, setIdExpediente] = React.useState<number | null>(null);
  const [nemotecnico, setNemotecnico] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  React.useEffect(() => {
    const loadData = async (): Promise<void> => {
      setLoading(true);
      setError("");
      setIsJefeProyecto(false);
      setExpedienteListItemId(null);
      setIdExpediente(null);
      setNemotecnico("");

      const planIdParam = String(
        new URLSearchParams(window.location.search).get("PlanId") || "",
      ).trim();

      if (!planIdParam) {
        setError("No se ha indicado un PlanId en la URL.");
        setLoading(false);
        return;
      }

      try {
        const currentNameNorm = normalize(context.pageContext.user.displayName);
        const currentEmailNorm = normalize(context.pageContext.user.email);

        const expedienteItems: Array<{
          Id?: number;
          IDExpediente?: number;
          Nemotecnico?: string;
          PlanId?: string;
        }> = await sp.web.lists
          .getByTitle("Expedientes")
          .items.filter(`PlanId eq '${escapeODataValue(planIdParam)}'`)
          .select("Id", "IDExpediente", "Nemotecnico", "PlanId")
          .top(1)
          .get();

        if (!expedienteItems.length) {
          setError("No se encontró ningún expediente asociado a este PlanId.");
          setLoading(false);
          return;
        }

        const expItem = expedienteItems[0];
        const expId = Number(expItem.IDExpediente) || 0;
        const listItemId = Number(expItem.Id) || 0;

        if (!expId || !listItemId) {
          setError("No se pudo identificar el expediente asociado.");
          setLoading(false);
          return;
        }

        setIdExpediente(expId);
        setExpedienteListItemId(listItemId);
        setNemotecnico(String(expItem.Nemotecnico || "").trim());
        setPlanIdInput(String(expItem.PlanId || planIdParam).trim());

        const rolesRaw: Array<{ Title?: string; usuario?: string }> =
          await sp.web.lists
            .getByTitle("Roles_usuario")
            .items.filter(
              `IDExpediente eq ${expId} and IDRol eq ${JEFE_PROYECTO_ROL_ID}`,
            )
            .select("Title", "usuario")
            .top(5000)
            .getAll();

        const hasJefeRole = rolesRaw.some((role) => {
          const roleNameNorm = normalize(role?.Title);
          const roleUserNorm = normalize(role?.usuario);
          return (
            (currentNameNorm && roleNameNorm === currentNameNorm) ||
            (currentEmailNorm && roleUserNorm.indexOf(currentEmailNorm) >= 0)
          );
        });

        setIsJefeProyecto(hasJefeRole);
      } catch (e) {
        console.error("Error cargando datos del expediente para Planner:", e);
        setError("No se pudieron cargar los datos del expediente.");
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [context]);

  const handleSave = async (): Promise<void> => {
    const planIdValue = String(planIdInput || "").trim();
    if (!planIdValue) {
      setError("Debes introducir un PlanId.");
      return;
    }
    if (!expedienteListItemId) {
      setError("No se pudo identificar el expediente.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await sp.web.lists
        .getByTitle("Expedientes")
        .items.getById(expedienteListItemId)
        .update({ PlanId: planIdValue });

      const baseUrl = context.pageContext.web.absoluteUrl.replace(/\/$/, "");
      window.location.href = `${baseUrl}/SitePages/Planner.aspx?PlanId=${encodeURIComponent(planIdValue)}`;
    } catch (e) {
      console.error("Error guardando PlanId del expediente:", e);
      setError("No se pudo guardar el PlanId. Inténtalo de nuevo.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section
        className={`${styles.planner} ${hasTeamsContext ? styles.teams : ""}`}
      >
        <div className={styles.empty}>Cargando...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        className={`${styles.planner} ${hasTeamsContext ? styles.teams : ""}`}
      >
        <div className={styles.error}>{error}</div>
      </section>
    );
  }

  if (!isJefeProyecto) {
    return null;
  }

  return (
    <section
      className={`${styles.planner} ${hasTeamsContext ? styles.teams : ""}`}
    >
      <div className={styles.header}>
        <h2>Editar PlanId del expediente</h2>
        {nemotecnico ? (
          <p className={styles.subtitle}>
            Expediente {idExpediente} — {nemotecnico}
          </p>
        ) : idExpediente ? (
          <p className={styles.subtitle}>Expediente {idExpediente}</p>
        ) : null}
      </div>

      <div className={styles.form}>
        <label className={styles.fieldLabel} htmlFor="planner-plan-id">
          PlanId
        </label>
        <div className={styles.formRow}>
          <input
            id="planner-plan-id"
            type="text"
            value={planIdInput}
            onChange={(e) => setPlanIdInput(e.target.value)}
            disabled={saving}
            placeholder="Introduce el PlanId"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default Planner;
