// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene outputs
// and errors, dates and sizes. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks every
// table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './seafile/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Seafile server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Seafile dans la configuration.",
    de: 'Gib die Adresse deines Seafile-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Seafile en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:8000',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:8000',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:8000',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:8000',
  },
  noCredentials: {
    en: 'Enter the username and password of your Seafile account, or an API token, in the configuration.',
    fr: "Saisissez l'identifiant et le mot de passe de votre compte Seafile, ou un jeton d'API, dans la configuration.",
    de: 'Gib Benutzername und Passwort deines Seafile-Kontos oder ein API-Token in der Konfiguration ein.',
    es: 'Introduzca el usuario y la contraseña de su cuenta de Seafile, o un token de API, en la configuración.',
  },
};

// One short explanation per error kind (src/seafile/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Seafile does not answer',
    fr: 'Seafile ne répond pas',
    de: 'Seafile antwortet nicht',
    es: 'Seafile no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use a valid certificate or http://',
    fr: 'certificat refusé : utilisez un certificat valide ou http://',
    de: 'Zertifikat abgelehnt: Nutze ein gültiges Zertifikat oder http://',
    es: 'certificado rechazado: use un certificado válido o http://',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'username, password or token refused by Seafile',
    fr: 'identifiant, mot de passe ou jeton refusé par Seafile',
    de: 'Benutzername, Passwort oder Token von Seafile abgelehnt',
    es: 'usuario, contraseña o token rechazados por Seafile',
  },
  [ERROR_KINDS.OTP]: {
    en: 'two-factor authentication is on: use an API token',
    fr: "double authentification active : utilisez un jeton d'API",
    de: 'Zwei-Faktor-Authentifizierung aktiv: Nutze ein API-Token',
    es: 'autenticación en dos pasos activa: use un token de API',
  },
  [ERROR_KINDS.NOT_SEAFILE]: {
    en: 'no Seafile API at this address',
    fr: 'aucune API Seafile à cette adresse',
    de: 'keine Seafile-API unter dieser Adresse',
    es: 'no hay ninguna API de Seafile en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.THROTTLED]: {
    en: 'Seafile limits the requests: choose a longer interval',
    fr: 'Seafile limite les requêtes : choisissez une fréquence plus lente',
    de: 'Seafile begrenzt die Anfragen: Wähle ein längeres Intervall',
    es: 'Seafile limita las solicitudes: elija un intervalo más largo',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version, name) => `connected to ${version} as ${name}`,
    usage: (used, quota) => (quota ? `${used} of ${quota} used` : `${used} used, no quota`),
    libraries: (n) => `${n} librar${n === 1 ? 'y' : 'ies'}`,
    admin: 'administrator: server device available',
  },
  fr: {
    ok: (version, name) => `connecté à ${version} en tant que ${name}`,
    usage: (used, quota) =>
      quota ? `${used} utilisés sur ${quota}` : `${used} utilisés, sans quota`,
    libraries: (n) => `${n} bibliothèque(s)`,
    admin: 'administrateur : appareil serveur disponible',
  },
  de: {
    ok: (version, name) => `verbunden mit ${version} als ${name}`,
    usage: (used, quota) =>
      quota ? `${used} von ${quota} belegt` : `${used} belegt, kein Kontingent`,
    libraries: (n) => `${n} Bibliothek(en)`,
    admin: 'Administrator: Server-Gerät verfügbar',
  },
  es: {
    ok: (version, name) => `conectado a ${version} como ${name}`,
    usage: (used, quota) => (quota ? `${used} usados de ${quota}` : `${used} usados, sin cuota`),
    libraries: (n) => `${n} biblioteca(s)`,
    admin: 'administrador: dispositivo servidor disponible',
  },
};

// The `sentence` output of "State of the account".
export const SENTENCE_TEXT = {
  en: {
    quota: (percent, used, quota) => `${used} of ${quota} used (${percent} %)`,
    noQuota: (used) => `${used} used`,
    libraries: (n) => `${n} librar${n === 1 ? 'y' : 'ies'}`,
    last: (name, time) => `last modified: ${name} on ${time}`,
  },
  fr: {
    quota: (percent, used, quota) => `${used} utilisés sur ${quota} (${percent} %)`,
    noQuota: (used) => `${used} utilisés`,
    libraries: (n) => `${n} bibliothèque${n > 1 ? 's' : ''}`,
    last: (name, time) => `dernière modification : ${name} le ${time}`,
  },
  de: {
    quota: (percent, used, quota) => `${used} von ${quota} belegt (${percent} %)`,
    noQuota: (used) => `${used} belegt`,
    libraries: (n) => `${n} ${n === 1 ? 'Bibliothek' : 'Bibliotheken'}`,
    last: (name, time) => `zuletzt geändert: ${name} am ${time}`,
  },
  es: {
    quota: (percent, used, quota) => `${used} usados de ${quota} (${percent} %)`,
    noQuota: (used) => `${used} usados`,
    libraries: (n) => `${n} biblioteca${n === 1 ? '' : 's'}`,
    last: (name, time) => `última modificación: ${name} el ${time}`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
const formats = new Map();

/** A date as day/month hours:minutes, in the time zone of Gladys (the supervisor injects TZ). */
export function formatTime(time, language) {
  const locale = LOCALES[language] ?? LOCALES.en;
  if (!formats.has(locale)) {
    formats.set(
      locale,
      new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formats.get(locale).format(new Date(time));
}

/** "1.2 GB" (decimal units, as Seafile shows them). */
export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
