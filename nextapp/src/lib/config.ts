// Configuration constants - sourced from environment or defaults matching config.yaml
export const ORGANIZATION = process.env.ORGANIZATION || "pagopa";

export const REPOSITORIES = (
  process.env.REPOSITORIES ||
  "dx,io-infra,io-wallet,io-messages,io-services-cms,io-auth-n-identity-domain,io-ipatente,io-cgn,io-cdc,io-sign,developer-portal,interop-be-monorepo,selfcare,plsm-service-management,selfcare-infra,b2b-portals"
).split(",");

export const DX_TEAM_MEMBERS = (
  process.env.DX_TEAM_MEMBERS ||
  "gunzip,lucacavallaro,Krusty93,kin0992,christian-calabrese,mamu0"
).split(",");

export const DX_REPO = process.env.DX_REPO || "dx";

export const BOT_AUTHORS = ["renovate-pagopa", "dependabot", "dx-pagopa-bot"];

export const TIME_INTERVALS = [
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "120 days", value: 120 },
  { label: "240 days", value: 240 },
  { label: "300 days", value: 300 },
  { label: "360 days", value: 360 },
  { label: "720 days", value: 720 },
  { label: "1080 days", value: 1080 },
  { label: "1440 days", value: 1440 },
];
