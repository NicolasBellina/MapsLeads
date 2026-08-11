// Configuration du paiement (ExtensionPay + Stripe).
//
// EXTENSION_ID est l'identifiant choisi lors de l'enregistrement de
// l'extension sur https://extensionpay.com/. C'est le slug visible dans
// l'URL du dashboard, pas l'ID Chrome Web Store.
// Voir docs/setup-paiement.md.
export const EXTENSION_ID = "mapsleads";

// Duree de l'essai gratuit, en jours. ExtensionPay stocke la date de debut
// (user.trialStartedAt) ; la duree est verifiee ici, cote extension.
export const TRIAL_DAYS = 2;

// "DEV"  : acces complet sans paiement, pour le developpement local.
// "PROD" : essai puis abonnement obligatoire.
export const MODE = "PROD";

// Comptes de demonstration : acces illimite et permanent, sans paiement.
// L'utilisateur doit s'etre connecte avec cet email via "Restaurer mon
// abonnement" ; ExtensionPay ne renvoie l'email qu'apres cette connexion.
// Reserve a vous-meme, vos testeurs et vos demos commerciales.
export const DEMO_EMAILS = ["nicolasbellina72@gmail.com"];
