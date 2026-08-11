// Configuration du paiement (ExtensionPay + Stripe).
//
// EXTENSION_ID est l'identifiant choisi lors de l'enregistrement de
// l'extension sur https://extensionpay.com/. C'est le slug visible dans
// l'URL du dashboard, pas l'ID Chrome Web Store.
// Voir docs/setup-paiement.md.
export const EXTENSION_ID = "mapsleads";

// Duree de l'essai gratuit, en jours. ExtensionPay stocke la date de debut
// (user.trialStartedAt) ; la duree est verifiee ici, cote extension.
export const TRIAL_DAYS = 0;

// "DEV"  : acces complet sans paiement, pour le developpement local.
// "PROD" : essai puis abonnement obligatoire.
export const MODE = "PROD";
