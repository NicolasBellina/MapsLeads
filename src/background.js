// Service worker. ExtPay.startBackground() est requis pour que le reste de
// l'extension puisse interroger le statut de paiement.
importScripts("/src/vendor/ExtPay.js");

const extpay = ExtPay("mapsleads"); // doit correspondre a EXTENSION_ID dans src/lib/config.js
extpay.startBackground();
