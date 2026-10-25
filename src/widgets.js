// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `storage`.
//
// The use case: a glance at the wall tablet tells how full the Seafile account
// is, and which library moved last (the photos of the phone arrived, the
// backup of last night ran). So the widget shows the quota used as a gauge
// (or the space used without quota), the space used and the number of
// libraries, then the libraries modified last, newest first, with their size
// and time.
//
// The figures are sent as values, not bound to device features: the widget
// works before the account is added to Gladys.
//
// Budget (8 components, 2 texts): three tiles, one text (Seafile not
// answering, no library), one status list of six rows, a Refresh button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { quotaPercent } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ERROR_TEXT, formatBytes, formatTime, pick } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ REFRESH: 'refresh' });

export const MAX_ROWS = 6;

export const TEXT = {
  pick: {
    en: 'Enter the address of your Seafile server and your account in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Seafile et votre compte dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Seafile-Servers und dein Konto in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Seafile y su cuenta en la configuración de la integración.',
  },
  empty: {
    en: 'No library yet.',
    fr: "Aucune bibliothèque pour l'instant.",
    de: 'Noch keine Bibliothek.',
    es: 'Todavía no hay ninguna biblioteca.',
  },
  quota: { en: 'Quota', fr: 'Quota', de: 'Kontingent', es: 'Cuota' },
  noQuota: { en: 'No quota', fr: 'Sans quota', de: 'Kein Limit', es: 'Sin cuota' },
  used: { en: 'Used', fr: 'Utilisé', de: 'Belegt', es: 'Usado' },
  libraries: { en: 'Libraries', fr: 'Bibliothèques', de: 'Bibliotheken', es: 'Bibliotecas' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Seafile read again.',
    fr: 'Seafile relu.',
    de: 'Seafile neu gelesen.',
    es: 'Seafile leído de nuevo.',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

/** Gauge color: red from the trigger threshold of the configuration, orange 10 points below it. */
export function quotaColor(percent, threshold) {
  if (percent >= threshold) {
    return WIDGET_COLORS.DANGER;
  }
  return percent >= threshold - 10 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
}

async function get(hub, { language = 'en' }) {
  if (!hub.client) {
    const status = hub.connectionStatus();
    return message(hub.config.urlTyped && !hub.config.url ? status.message : TEXT.pick, language);
  }
  const account = hub.account;
  const percent = account ? quotaPercent(account) : null;
  const components = [];
  if (percent !== null) {
    components.push({
      type: 'gauge',
      value: Math.min(percent, 100),
      min: 0,
      max: 100,
      unit: '%',
      label: pick(TEXT.quota, language),
      color: quotaColor(percent, hub.config.quotaThreshold),
    });
  } else {
    components.push({
      type: 'value',
      value: account ? pick(TEXT.noQuota, language) : '-',
      label: pick(TEXT.quota, language),
      icon: 'pie-chart',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push(
    {
      type: 'value',
      value: account ? fit(formatBytes(account.usage), 12) : '-',
      label: pick(TEXT.used, language),
      icon: 'hard-drive',
      color: WIDGET_COLORS.INFO,
    },
    {
      type: 'value',
      value: account ? hub.repos.length : '-',
      label: pick(TEXT.libraries, language),
      icon: 'folder',
      color: WIDGET_COLORS.NEUTRAL,
    },
  );

  const recent = [...hub.repos].sort((a, b) => b.mtime - a.mtime).slice(0, MAX_ROWS);
  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  } else if (account && recent.length === 0) {
    components.push({ type: 'text', variant: 'body', text: pick(TEXT.empty, language) });
  }

  if (recent.length > 0) {
    components.push({
      type: 'status',
      items: recent.map((repo) => ({
        label: fit(repo.name, 40),
        value: fit(`${formatBytes(repo.size)} · ${formatTime(repo.mtime, language)}`, 40),
        icon: repo.kind === 'mine' ? 'folder' : 'share-2',
        color: WIDGET_COLORS.INFO,
      })),
    });
  }

  components.push({
    type: 'button',
    label: pick(TEXT.refresh, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.REFRESH },
  });

  return { ttl_seconds: Math.max(30, hub.config.pollIntervalMs / 1000), components };
}

async function action(hub, { actionKey }) {
  if (actionKey !== ACTIONS.REFRESH) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.pollNow();
  if (hub.error) {
    return { message: ERROR_TEXT[hub.error.kind] };
  }
  return { message: TEXT.refreshed };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
