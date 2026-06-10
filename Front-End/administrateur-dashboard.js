// ═══════════════════════════════════════════════════
//  admin-dashboard.js — E-Voting Admin Dashboard
// ═══════════════════════════════════════════════════

/* ─── Config ─────────────────────────────────────── */
const API_BASE_URL = " https://d89a-41-97-127-163.ngrok-free.app";

/* ─── State ─────────────────────────────────────── */
let currentAdmin = null;
let lastDashboardData = { elections: [] };

/* ─── Utilities ─────────────────────────────────── */

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function showToast(message, type = "info") {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const color = type === "error" ? "bg-red-600" : "bg-emerald-600";
    const t = document.createElement("div");
    t.className = `${color} text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-sm pointer-events-auto`;
    t.textContent = message;
    stack.appendChild(t);
    setTimeout(() => {
        t.classList.add("opacity-0", "translate-x-2", "transition-all", "duration-300");
        setTimeout(() => t.remove(), 320);
    }, 2800);
}

function bindIfPresent(id, eventName, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    const flag = `evoteBound_${eventName}`;
    if (el.dataset[flag] === "1") return;
    el.dataset[flag] = "1";
    el.addEventListener(eventName, handler);
}

/* ─── Profile Modal ──────────────────────────────── */

function openAdminProfile() {
    openAdminProfileModal();
}

function closeAdminProfile() {
    closeAdminProfileModal();
}

/* ─── Confirmation Dialog ────────────────────────── */

function askConfirmation({ title, message }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById("confirm-overlay");
        const titleEl = document.getElementById("confirm-title");
        const msgEl = document.getElementById("confirm-message");
        const noBtn = document.getElementById("confirm-no");
        const yesBtn = document.getElementById("confirm-yes");

        if (!overlay || !titleEl || !msgEl || !noBtn || !yesBtn) {
            resolve(false);
            return;
        }

        titleEl.textContent = title || "Confirmation";
        msgEl.textContent = message || "";

        overlay.classList.remove("hidden");
        overlay.classList.add("flex");

        const done = (v) => {
            overlay.classList.add("hidden");
            overlay.classList.remove("flex");
            noBtn.removeEventListener("click", onNo);
            yesBtn.removeEventListener("click", onYes);
            overlay.removeEventListener("click", onBackdrop);
            resolve(v);
        };

        const onNo = () => done(false);
        const onYes = () => done(true);
        const onBackdrop = (e) => { if (e.target === overlay) done(false); };

        noBtn.addEventListener("click", onNo);
        yesBtn.addEventListener("click", onYes);
        overlay.addEventListener("click", onBackdrop);
    });
}

/* ─── Logout Permission Dialog ───────────────────── */

window.askLogoutPermission = function () {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-4";
        overlay.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl transform transition-all scale-100 border border-slate-100">
                <div class="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                    <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </div>
                <h3 class="text-2xl font-bold text-slate-800 text-center mb-2">Déconnexion</h3>
                <p class="text-slate-500 text-center mb-8">Êtes-vous sûr de vouloir quitter votre session administrateur ?</p>
                <div class="flex gap-4">
                    <button id="cancel-logout" class="flex-1 px-6 py-3.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">Annuler</button>
                    <button id="confirm-logout" class="flex-1 px-6 py-3.5 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition-all">Se déconnecter</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById("cancel-logout").onclick = () => { overlay.remove(); resolve(false); };
        document.getElementById("confirm-logout").onclick = () => { overlay.remove(); resolve(true); };
    });
};

async function handleLogout() {
    const permitted = await askLogoutPermission();
    if (!permitted) return;
    const ok = await askConfirmation({ title: tAdmin("CONFIRMATION"), message: tAdmin("Voulez-vous vraiment quitter") });
    if (ok) {
        localStorage.removeItem("evote_user");
        localStorage.removeItem("admin_email");
        sessionStorage.removeItem("admin_private_pkcs8_b64");
        sessionStorage.removeItem("admin_email");
        currentAdmin = null;
        window.location.href = "index.html";
    }
}

/* ─── Action View (generic modal) ───────────────── */

function openActionView(title, html) {
    document.getElementById("action-view-title").textContent = title;
    document.getElementById("action-view-body").innerHTML = html;
    document.getElementById("action-view-overlay").classList.remove("hidden");
}

function closeActionView() {
    document.getElementById("action-view-overlay").classList.add("hidden");
}

/* ─── Results Rendering ──────────────────────────── */

function renderPublishedResultsIn(targetId, election, payload) {
    const target = document.getElementById(targetId);
    if (!target) return;

    const results = payload?.results || {};
    const rows = Array.isArray(results.tally) ? results.tally : [];

    if (!rows.length) {
        target.innerHTML = '<p class="text-sm text-slate-500">Aucun détail de résultat disponible.</p>';
        return;
    }

    const total = rows.reduce((acc, r) => acc + (Number(r.votes) || 0), 0);
    const winnerVotes = Math.max(0, ...rows.map((r) => Number(r.votes) || 0));

    const tableRows = rows.map((r) => {
        const v = Number(r.votes) || 0;
        const pct = total > 0 ? ((v * 100) / total).toFixed(1) : "0.0";
        const isWinner = v === winnerVotes && winnerVotes > 0;
        const rowClass = isWinner ? "bg-emerald-50/70" : "";
        const nameClass = isWinner ? "text-emerald-800" : "text-slate-800";
        const voteClass = isWinner ? "text-emerald-700 font-bold" : "text-slate-700";
        return `<tr class="border-t border-slate-100 ${rowClass}">
            <td class="py-2.5 px-3 font-medium ${nameClass}">${escapeHtml(r.nom || `Candidat ${r.candidat_id}`)}${isWinner ? ' <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">(gagnant)</span>' : ""}</td>
            <td class="py-2.5 px-3 text-center ${voteClass}">${v}</td>
            <td class="py-2.5 px-3 text-center text-fuchsia-700 font-semibold">${pct}%</td>
        </tr>`;
    }).join("");

    const rankingRows = [...rows]
        .sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0))
        .map((r, idx) => {
            const v = Number(r.votes) || 0;
            const isWinner = v === winnerVotes && winnerVotes > 0;
            const rowClass = isWinner ? "bg-emerald-50/70" : "";
            const nameClass = isWinner ? "text-emerald-800 font-bold" : "text-slate-800";
            const rankClass = isWinner ? "text-emerald-700" : "text-slate-700";
            return `<tr class="border-t border-slate-100 ${rowClass}">
                <td class="py-2.5 px-3 ${rankClass} font-semibold">${idx + 1}</td>
                <td class="py-2.5 px-3 font-medium ${nameClass}">${escapeHtml(r.nom || `Candidat ${r.candidat_id}`)}${isWinner ? ' <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">(gagnant)</span>' : ""}</td>
            </tr>`;
        }).join("");

    const mode = (election?.affichage_resultats || payload?.affichage_resultats || "").toLowerCase();
    const useTable = mode === "complet" || (!mode && isAffichageComplet(election || payload));

    const body = useTable
        ? `<div class="rounded-xl border border-slate-200 overflow-hidden">
               <table class="w-full text-sm">
                   <thead><tr class="text-left text-slate-500 bg-white"><th class="py-2.5 px-3">Candidat</th><th class="py-2.5 px-3 text-center">Voix</th><th class="py-2.5 px-3 text-center">%</th></tr></thead>
                   <tbody>${tableRows}</tbody>
               </table>
           </div>`
        : `<div class="rounded-xl border border-slate-200 overflow-hidden">
               <table class="w-full text-sm">
                   <thead><tr class="text-left text-slate-500 bg-white"><th class="py-2.5 px-3">Rang</th><th class="py-2.5 px-3">Candidat</th></tr></thead>
                   <tbody>${rankingRows}</tbody>
               </table>
           </div>`;

    target.innerHTML = `
        <div class="bg-slate-50 px-4 py-2 text-xs text-slate-500 rounded-t-xl border border-slate-200 border-b-0">
            Publication : ${escapeHtml(payload?.date_publication || "-")} ${escapeHtml(payload?.temps_publication || "")}
        </div>
        ${body}`;
}

const verifyGlobalHash = window.verifyGlobalHash || (async () => false);
const isAffichageComplet = window.isAffichageComplet || (() => false);

const ADMIN_EYE_ICON_SVG = `<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
</svg>`;

const buildAdminBulletinsAuditRows = window.buildBulletinsAuditRows || (() => "");

async function openElectionResultsView(electionId) {
    const election = (lastDashboardData.elections || []).find((e) => e.id === electionId);
    openActionView("Résultats d'élection", '<p class="text-sm text-slate-500 animate-pulse">Chargement des données d\'audit et des résultats...</p>');

    try {
        // Source de vérité alignée avec le dashboard électeur.
        const resResults = await fetch(`${API_BASE_URL}/api/public/elections/${electionId}/published-results`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const resultsData = await resResults.json().catch(() => ({}));

        if (!resResults.ok) {
            openActionView("Résultats d'élection", `<p class="text-sm text-red-600">${escapeHtml(resultsData.detail || "Résultats indisponibles.")}</p>`);
            return;
        }

        const electionMeta = {
            affichage_resultats: election?.affichage_resultats || resultsData?.affichage_resultats,
            affichage_resultats_label: election?.affichage_resultats_label,
        };
        const showGlobalAudit = isAffichageComplet(electionMeta);

        let auditSectionHtml = "";
        if (showGlobalAudit) {
            const verification = resultsData?.verification_globale || {};
            const hashListe = verification?.hash_liste_bulletins || "-";
            const signatureAdmin = verification?.signature_administrateur || "-";
            const cleAdmin = verification?.cle_publique_administrateur || "-";
            const bulletins = Array.isArray(resultsData?.bulletins) ? resultsData.bulletins : [];
            const auditRowsHtml = buildAdminBulletinsAuditRows(bulletins);
            const isIntegrityValid = await verifyGlobalHash(bulletins, hashListe);
            const integrityText = isIntegrityValid ? "✅ Intégrité vérifiée" : "❌ Données altérées !";

            auditSectionHtml = `
            <div class="mt-6 border-t border-slate-200 pt-4">
                <h5 class="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-3">🛡️ Audit & registre de transparence</h5>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Intégrité</p>
                        <p id="admin-global-integrity-status" class="${isIntegrityValid ? "text-emerald-700" : "text-red-700"} font-bold mt-1">${integrityText}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Bulletins enregistrés</p>
                        <p class="text-slate-800 font-bold mt-1">${bulletins.length}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Publication</p>
                        <p class="text-slate-800 font-bold mt-1">${escapeHtml(resultsData?.date_publication || "-")} ${escapeHtml(resultsData?.temps_publication || "")}</p>
                    </div>
                </div>

                <details class="group border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm mb-3">
                    <summary class="list-none flex justify-between items-center p-4 bg-slate-50/50 cursor-pointer select-none text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <span>Urne globale & sceau administrateur</span>
                        <span class="transition group-open:rotate-180 text-slate-400">▼</span>
                    </summary>
                    <div class="p-4 border-t border-slate-100 bg-white text-xs text-slate-600 space-y-3">
                        <div>
                            <strong class="text-slate-700 block mb-1">hash_liste_bulletins (H(L)) :</strong>
                            <div class="flex gap-1">
                                <input type="text" class="font-mono text-[11px] bg-slate-50 p-1.5 border border-slate-200 rounded w-full" readonly value="${escapeHtml(hashListe)}">
                                <button type="button" class="bg-slate-200 hover:bg-slate-300 px-3 py-1 rounded text-xs shrink-0" onclick="navigator.clipboard.writeText('${hashListe.replace(/'/g, "\\'")}')">Copier</button>
                            </div>
                        </div>
                        <div>
                            <strong class="text-slate-700 block mb-1">Signature numérique de l'administrateur :</strong>
                            <textarea class="font-mono text-[11px] bg-slate-50 p-1.5 border border-slate-200 rounded w-full" rows="2" readonly>${escapeHtml(signatureAdmin)}</textarea>
                        </div>
                        <div>
                            <strong class="text-slate-700 block mb-1">Clé publique administrateur :</strong>
                            <input type="text" class="font-mono text-[11px] bg-slate-50 p-1.5 border border-slate-200 rounded w-full" readonly value="${escapeHtml(cleAdmin)}">
                        </div>
                    </div>
                </details>

                <details class="group border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm" open>
                    <summary class="list-none flex justify-between items-center p-4 bg-slate-50/50 cursor-pointer select-none text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <span>Registre public (${bulletins.length} vote(s))</span>
                        <span class="transition group-open:rotate-180 text-slate-400">▼</span>
                    </summary>
                    <div class="p-2 border-t border-slate-100 bg-white max-h-72 overflow-y-auto overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse min-w-[640px]">
                            <thead>
                                <tr class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase">
                                    <th class="py-2 px-3 text-center w-10">Index</th>
                                    <th class="py-2 px-3 min-w-[180px]">hash_bulletin_chiffré</th>
                                    <th class="py-2 px-3">signature_bulletin_chiffré</th>
                                    <th class="py-2 px-3 min-w-[200px]">clé_publique_électeur</th>
                                    <th class="py-2 px-3">candidat_choisi</th>
                                </tr>
                            </thead>
                            <tbody>${auditRowsHtml}</tbody>
                        </table>
                    </div>
                </details>
            </div>`;
        }

        const fullDashboardViewHtml = `
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">📊 Suffrages et décompte final</p>
            <div id="single-results-wrap" class="mb-2"></div>
            ${auditSectionHtml}
        `;

        openActionView(`Résultats — ${escapeHtml(election?.titre || `Élection #${electionId}`)}`, fullDashboardViewHtml);

        // 5. Exécution de votre fonction de rendu native pour dessiner le tableau des scores
        renderPublishedResultsIn("single-results-wrap", election, resultsData);

    } catch (_) {
        openActionView("Résultats d'élection", '<p class="text-sm text-red-600">Erreur de connexion ou de traitement serveur.</p>');
    }
}

async function openQuickResultsView() {
    const rows = (lastDashboardData.elections || []).map((e) => `
        <div class="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4">
            <div>
                <p class="font-semibold text-slate-800">${escapeHtml(e.titre)}</p>
                <p class="text-xs text-slate-500">${escapeHtml(e.date_ouverture)} ${escapeHtml(e.temps_ouverture)} -> ${escapeHtml(e.date_cloture)} ${escapeHtml(e.temps_cloture)}</p>
            </div>
            <button type="button" class="admin-see-results-btn px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 ${electionResultsPublished(e) ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"}" data-eid="${e.id}" ${electionResultsPublished(e) ? "" : "disabled"}>${electionResultsPublished(e) ? `${ADMIN_EYE_ICON_SVG}<span>Voir résultats</span>` : "Non publiés"}</button>
        </div>
    `).join("");

    openActionView("Résultats des élections", rows || '<p class="text-sm text-slate-500">Aucune élection.</p>');
    document.querySelectorAll(".admin-see-results-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.dataset.eid, 10);
            if (Number.isFinite(id)) openElectionResultsView(id);
        });
    });
}

/* ─── Electors Management ────────────────────────── */

function openCandidatesView() {
    const elections = lastDashboardData.elections || [];
    const html = elections.length
        ? elections.map((e) => `
            <div class="rounded-xl border border-slate-200 p-4 mb-3">
                <p class="font-semibold text-slate-800">${escapeHtml(e.titre)}</p>
                <p class="text-xs text-slate-500 mt-1">Nombre de candidats: <span class="font-semibold text-emerald-700">${e.candidats}</span></p>
                <p class="text-xs text-slate-500">Statut: ${escapeHtml(e.status)}</p>
            </div>
        `).join("")
        : '<p class="text-sm text-slate-500">Aucune élection pour le moment.</p>';
    openActionView("Gestion des candidats", html);
}

function openStatsView() {
    const elections = lastDashboardData.elections || [];
    const total = elections.length;
    const participants = elections.reduce((a, e) => a + (Number(e.participants) || 0), 0);
    const votes = elections.reduce((a, e) => a + (Number(e.votes) || 0), 0);
    const avg = participants > 0 ? ((votes * 100) / participants).toFixed(2) : "0.00";
    const html = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="rounded-xl border border-indigo-100 bg-indigo-50 p-4"><p class="text-indigo-600 text-sm">Élections</p><p class="text-3xl font-bold text-indigo-800">${total}</p></div>
            <div class="rounded-xl border border-blue-100 bg-blue-50 p-4"><p class="text-blue-600 text-sm">Participants cumulés</p><p class="text-3xl font-bold text-blue-800">${participants}</p></div>
            <div class="rounded-xl border border-amber-100 bg-amber-50 p-4"><p class="text-amber-600 text-sm">Votes cumulés</p><p class="text-3xl font-bold text-amber-800">${votes}</p></div>
            <div class="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p class="text-emerald-600 text-sm">Participation moyenne</p><p class="text-3xl font-bold text-emerald-800">${avg}%</p></div>
        </div>`;
    openActionView("Statistiques détaillées", html);
}

/* ─── Crypto Helpers ─────────────────────────────── */

async function sha256Hex(input) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function xorDecryptElectionKeyAdminPub(adminPubKeyUtf8, encStr) {
    const parts = encStr.trim().split(":");
    if (parts.length !== 2) throw new Error("Enc_k élection illisible");
    const cipherHex = parts[1];
    const buf = new TextEncoder().encode(adminPubKeyUtf8);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const km = new Uint8Array(digest);
    const cbin = forge.util.hexToBytes(cipherHex);
    const cout = new Uint8Array(cbin.length);
    for (let i = 0; i < cbin.length; i++) {
        cout[i] = (cbin.charCodeAt(i) ^ km[i % 32]) & 255;
    }
    let hexOut = "";
    for (let i = 0; i < cout.length; i++) hexOut += cout[i].toString(16).padStart(2, "0");
    return hexOut;
}

function b64ToU8(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function bufferToHex(buf) {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToU8(hex) {
    const h = hex.trim().replace(/\s+/g, "");
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < h.length; i += 2) out[i / 2] = parseInt(h.slice(i, i + 2), 16);
    return out;
}

async function importAdminSigningKey(pkcs8B64) {
    return crypto.subtle.importKey("pkcs8", b64ToU8(pkcs8B64), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function sha256Utf8Hex(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return bufferToHex(digest);
}

async function signP256Hex(pkcs8B64, message) {
    const key = await importAdminSigningKey(pkcs8B64);
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(message));
    return bufferToHex(sig);
}

function serverKemDeriveKey(sharedU8) {
    let bin = "";
    for (let i = 0; i < sharedU8.length; i++) bin += String.fromCharCode(sharedU8[i]);
    const md = forge.md.sha256.create();
    md.update(bin, "raw");
    md.update("|EVOTE-SERVER-KEM-v1", "utf8");
    return forge.util.hexToBytes(md.digest().toHex());
}

async function importP256EcdhPublicRaw(rawHex) {
    let h = rawHex.trim().toLowerCase().replace(/\s+/g, "");
    if (!h.startsWith("04")) h = "04" + h;
    return crypto.subtle.importKey("raw", hexToU8(h), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function wrapElectionKeyForDepServer(serverPubHex, electionPrivHex64) {
    const pubSrv = await importP256EcdhPublicRaw(serverPubHex);
    const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pubSrv }, ephemeral.privateKey, 256));
    const kemKey = serverKemDeriveKey(shared);
    const iv = forge.random.getBytesSync(16);
    const plain = forge.util.hexToBytes(electionPrivHex64);
    const cipher = forge.cipher.createCipher("AES-GCM", kemKey);
    cipher.start({ iv });
    cipher.update(forge.util.createBuffer(plain));
    cipher.finish();
    const ephemPub = bufferToHex(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
    return `EK1|${ephemPub}|${forge.util.bytesToHex(iv)}|${cipher.output.toHex() + cipher.mode.tag.toHex()}`;
}

/* ─── Dépouillement Flow ─────────────────────────── */

async function runDepouillementFlow(electionId) {
    const adminPrivHex = sessionStorage.getItem("admin_private_pkcs8_b64");
    const adminEmail = getAdminEmail();
    if (!adminPrivHex) { showToast(tAdmin("errSessionMissingKey"), "error"); return; }
    if (!adminEmail) { showToast(tAdmin("errSessionMissingEmail"), "error"); return; }

    const ok = await askConfirmation({ title: tAdmin("Publié Résultats"), message: `Lancer le dépouillement pour cet élection ?` });
    if (!ok) return;

    try {
        // ─── SÉCURISATION DU TYPE DE L'ID ───
        // Si votre base de données utilise des IDs numériques (ex: 1, 2, 3), forcez l'entier.
        // Si elle utilise des chaînes/UUID, remplacez par : const formattedId = electionId;
        const formattedId = isNaN(electionId) ? electionId : parseInt(electionId, 10);

        const r1 = await fetch(`${API_BASE_URL}/api/admin/elections/depouillement/start`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({
                admin_email: adminEmail.trim(),
                election_id: formattedId
            }),
        });

        const j1 = await r1.json();
        if (!r1.ok) {
            // Amélioration : Affiche j1.detail, j1.message, ou j1.error selon ce que renvoie l'API
            const errMsg = j1.detail || j1.message || j1.error || "Dépouillement refusé (400).";
            showToast(errMsg, "error");
            return;
        }

        const kElectionHex = await xorDecryptElectionKeyAdminPub(j1.admin_pubkey_hex, j1.enc_k_election);
        if (!/^[0-9a-fA-F]{64}$/.test(kElectionHex)) { showToast(tAdmin("depInvalidKey"), "error"); return; }

        const wrapped = await wrapElectionKeyForDepServer(j1.server_pubkey_hex, kElectionHex.toLowerCase());

        const r2 = await fetch(`${API_BASE_URL}/api/admin/elections/depouillement/tally-session`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({
                admin_email: adminEmail.trim(),
                election_id: formattedId,
                session_id: j1.session_id,
                ek_wrapped_for_server: wrapped
            }),
        });
        const j2 = await r2.json();
        if (!r2.ok) { showToast(j2.detail || j2.message || "Échec du décompte côté serveur.", "error"); return; }

        const summary = j2.results.tally.map((r) => `${r.nom || r.candidat_id}: ${r.votes}`).join("\n");
        const failN = j2.results.decryption_failures || 0;
        const proceed = await askConfirmation({
            title: tAdmin("CONFIRMATION"),
            message: ` Publier maintenant ?`,
        });
        if (!proceed) { showToast(tAdmin("depPublishCancelled"), "info"); return; }

        const messageToSign =
            j2.global_message ||
            (await sha256Utf8Hex(`${j2.canonical_for_signing || ""}${j2.hash_liste_bulletins || ""}`));
        if (!messageToSign || messageToSign.length !== 64) {
            showToast("Message de signature global invalide.", "error");
            return;
        }
        const signature = await signP256Hex(adminPrivHex, messageToSign);

        const r3 = await fetch(`${API_BASE_URL}/api/admin/elections/depouillement/publish`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({
                admin_email: adminEmail.trim(),
                election_id: formattedId,
                session_id: j1.session_id,
                signature_der_hex: signature
            }),
        });
        const j3 = await r3.json();
        if (!r3.ok) { showToast(j3.detail || j3.message || "Signature refusée ou publication impossible.", "error"); return; }

        showToast(j3.message || "Résultats publiés.", "success");
        await loadDashboardData();
    } catch (e) {
        console.error("Erreur technique lors du dépouillement :", e);
        showToast(tAdmin("depTechError"), "error");
    }
}

const adminI18n = (window.EVOTE_I18N && window.EVOTE_I18N.dictionaries.adminDashboard) || { fr: {}, en: {} };

function getAdminLang() {
    if (window.EVOTE_I18N?.getLanguage) return window.EVOTE_I18N.getLanguage();
    return "fr";
}

function setTextIfPresent(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function tAdmin(key) {
    const lang = getAdminLang();
    const bucket = adminI18n[lang] || adminI18n.fr;
    return bucket[key] || adminI18n.fr[key] || key;
}

function applyAdminLanguage() {
    const lang = getAdminLang();
    const t = adminI18n[lang];
    setTextIfPresent("admin-dashboard-title", t.dashboardTitle);
    setTextIfPresent("admin-language-header-label", t.languageHeaderLabel);
    document.documentElement.lang = lang === "en" ? "en" : "fr";
}

function toggleAdminLanguage() {
    const next = getAdminLang() === "fr" ? "en" : "fr";
    if (window.EVOTE_I18N?.setLanguage) window.EVOTE_I18N.setLanguage(next);
    else localStorage.setItem("evote_lang", next);
    applyAdminLanguage();
}

/* ─── Admin Profile (password / email change) ────── */

function resetAdminPasswordFlow() {
    document.getElementById("admin-pass-step-1")?.classList.remove("hidden");
    document.getElementById("admin-pass-step-2")?.classList.add("hidden");
    document.getElementById("admin-pass-step-3")?.classList.add("hidden");
    const fields = ["admin-password-otp", "admin-new-password", "admin-confirm-password"];
    fields.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
}

function openAdminProfileModal() {
    const overlay = document.getElementById("admin-profile-overlay");
    if (!overlay) return;

    document.getElementById("admin-profile-name").value = currentAdmin?.nom || "Administrateur";
    document.getElementById("admin-profile-email").value = getAdminEmail() || "-";

    const newEmailEl = document.getElementById("admin-new-email");
    const confirmEmailEl = document.getElementById("admin-confirm-email");
    if (newEmailEl) newEmailEl.value = "";
    if (confirmEmailEl) confirmEmailEl.value = "";

    document.getElementById("admin-email-change-panel")?.classList.add("hidden");
    document.getElementById("admin-password-change-panel")?.classList.add("hidden");
    resetAdminPasswordFlow();

    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
}

function closeAdminProfileModal() {
    const overlay = document.getElementById("admin-profile-overlay");
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
    document.getElementById("admin-email-change-panel")?.classList.add("hidden");
    document.getElementById("admin-password-change-panel")?.classList.add("hidden");
    resetAdminPasswordFlow();
}

function toggleAdminEmailPanel() {
    document.getElementById("admin-password-change-panel")?.classList.add("hidden");
    document.getElementById("admin-email-change-panel")?.classList.toggle("hidden");
}

function toggleAdminPasswordPanel() {
    document.getElementById("admin-email-change-panel")?.classList.add("hidden");
    document.getElementById("admin-password-change-panel")?.classList.toggle("hidden");
    resetAdminPasswordFlow();
}

async function saveAdminEmailChange() {
    const oldEmail = getAdminEmail();
    const newEmail = (document.getElementById("admin-new-email")?.value || "").trim().toLowerCase();
    const confirmEmail = (document.getElementById("admin-confirm-email")?.value || "").trim().toLowerCase();
    if (!newEmail || !confirmEmail) { showToast(tAdmin("profileFillEmails"), "error"); return; }

    const response = await fetch(`${API_BASE_URL}/api/admin/profile/change-email`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ current_email: oldEmail, new_email: newEmail, confirm_email: confirmEmail }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Changement email impossible.", "error"); return; }

    currentAdmin.email = data.email || newEmail;
    localStorage.setItem("evote_user", JSON.stringify(currentAdmin));
    sessionStorage.setItem("admin_email", currentAdmin.email);
    localStorage.setItem("admin_email", currentAdmin.email);
    document.getElementById("admin-email-display").textContent = currentAdmin.email;
    document.getElementById("admin-profile-email").value = currentAdmin.email;
    showToast(tAdmin("profileEmailChanged"), "success");
    document.getElementById("admin-email-change-panel")?.classList.add("hidden");
}

async function sendAdminPasswordOtp() {
    const response = await fetch(`${API_BASE_URL}/api/admin/password-reset/request`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ email: getAdminEmail() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Envoi OTP impossible.", "error"); return; }
    showToast(tAdmin("otpSent"), "success");
    document.getElementById("admin-pass-step-1")?.classList.add("hidden");
    document.getElementById("admin-pass-step-2")?.classList.remove("hidden");
}

async function verifyAdminPasswordOtp() {
    const otp = (document.getElementById("admin-password-otp")?.value || "").trim();
    const response = await fetch(`${API_BASE_URL}/api/admin/password-reset/verify`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ email: getAdminEmail(), otp }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "OTP invalide", "error"); return; }
    showToast(tAdmin("otpValidated"), "success");
    document.getElementById("admin-pass-step-2")?.classList.add("hidden");
    document.getElementById("admin-pass-step-3")?.classList.remove("hidden");
}

function adminU8ToB64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
}

async function adminDeriveAesWrapKeyFromPassword(password, saltU8) {
    const pwKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltU8, iterations: 100000, hash: "SHA-256" },
        pwKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["wrapKey", "unwrapKey"]
    );
}

async function buildAdminPasswordResetPayload(newPassword, email) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapKey = await adminDeriveAesWrapKeyFromPassword(newPassword, salt);
    const wrapped = await crypto.subtle.wrapKey("pkcs8", pair.privateKey, wrapKey, { name: "AES-GCM", iv });
    const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
    return {
        email,
        cle_publique: "WC_P256." + adminU8ToB64(new Uint8Array(spki)),
        sel: forge.util.encode64(String.fromCharCode(...salt)),
        iv: forge.util.encode64(String.fromCharCode(...iv)),
        enc_k: JSON.stringify({ v: 3, w: adminU8ToB64(new Uint8Array(wrapped)) }),
    };
}

async function saveAdminPasswordChange() {
    const np = document.getElementById("admin-new-password")?.value || "";
    const cp = document.getElementById("admin-confirm-password")?.value || "";
    if (!np || !cp || np !== cp) { showToast(tAdmin("pwdMismatch"), "error"); return; }

    const payload = await buildAdminPasswordResetPayload(np, getAdminEmail());
    const response = await fetch(`${API_BASE_URL}/api/admin/password-reset/confirm`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Changement mot de passe impossible.", "error"); return; }

    showToast(tAdmin("pwdChanged"), "success");
    document.getElementById("admin-password-change-panel")?.classList.add("hidden");
    resetAdminPasswordFlow();
}

/* ─── Identity / Session ─────────────────────────── */

function normalizeAdminUser(storedUser) {
    if (!storedUser || typeof storedUser !== "object") return null;
    const fallbackSessionEmail = (sessionStorage.getItem("admin_email") || "").trim().toLowerCase();
    const fallbackLocalEmail = (localStorage.getItem("admin_email") || "").trim().toLowerCase();
    return {
        ...storedUser,
        role: storedUser.role || storedUser.Role || "",
        nom: storedUser.nom || storedUser.Nom || "",
        email: (storedUser.email || storedUser.Email || fallbackSessionEmail || fallbackLocalEmail || "").trim().toLowerCase(),
    };
}

function getAdminEmail() {
    return (currentAdmin?.email || "").trim();
}

function loadAdminIdentity() {
    const storedUser = normalizeAdminUser(JSON.parse(localStorage.getItem("evote_user") || "null"));
    if (!storedUser || storedUser.role !== "admin") {
        window.location.href = "inscription-administrateur.html";
        return;
    }
    currentAdmin = storedUser;
    localStorage.setItem("evote_user", JSON.stringify(currentAdmin));
    if (storedUser.email) {
        sessionStorage.setItem("admin_email", storedUser.email);
        localStorage.setItem("admin_email", storedUser.email);
    }
    document.getElementById("admin-name-display").textContent = storedUser.nom || "Administrateur";
    document.getElementById("admin-email-display").textContent = storedUser.email || "-";
}

/* ─── Election Modal ─────────────────────────────── */

function openCreateElectionModal() {
    document.getElementById("create-election-modal").classList.remove("hidden");
    document.getElementById("create-election-modal").classList.add("flex");
}

function closeCreateElectionModal() {
    document.getElementById("create-election-form").reset();
    document.getElementById("nombre-votes-autorises").value = "1";
    document.getElementById("affichage-complet").checked = true;
    resetCandidateFields();
    const feedback = document.getElementById("create-election-feedback");
    feedback.textContent = "";
    feedback.className = "text-sm font-medium";
    document.getElementById("create-election-modal").classList.add("hidden");
    document.getElementById("create-election-modal").classList.remove("flex");
}

function getCandidatesListContainer() {
    return document.getElementById("candidats-list");
}

function getCandidateNames() {
    const container = getCandidatesListContainer();
    if (!container) return [];
    return Array.from(container.querySelectorAll(".candidat-input"))
        .map((el) => (el.value || "").trim())
        .filter(Boolean);
}

function hasEmptyCandidateField() {
    const container = getCandidatesListContainer();
    if (!container) return false;
    return Array.from(container.querySelectorAll(".candidat-input")).some((el) => !(el.value || "").trim());
}

function addCandidateField(value = "") {
    const container = getCandidatesListContainer();
    if (!container) return;
    const row = document.createElement("div");
    row.className = "flex items-center gap-2";
    row.innerHTML = `
        <input type="text" class="candidat-input soft-input w-full border border-slate-200 rounded-xl px-4 py-2.5 outline-none" placeholder="Nom complet du candidat" value="${escapeHtml(value)}">
        <button type="button" class="remove-candidat-btn px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">&times;</button>
    `;
    container.appendChild(row);
    row.querySelector(".remove-candidat-btn")?.addEventListener("click", () => row.remove());
}

function resetCandidateFields() {
    const container = getCandidatesListContainer();
    if (!container) return;
    container.innerHTML = "";
    addCandidateField();
}

function enforceScheduleConstraints() {
    const dateOuvEl = document.getElementById("date-ouverture");
    const tempsOuvEl = document.getElementById("temps-ouverture");
    const dateClotEl = document.getElementById("date-cloture");
    const tempsClotEl = document.getElementById("temps-cloture");

    if (!dateOuvEl || !tempsOuvEl || !dateClotEl || !tempsClotEl) return;

    // 1. Capture current live timestamps from the client's system clock
    const now = new Date();

    // Format current date as YYYY-MM-DD for the HTML5 native 'min' attribute
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const todayString = `${currentYear}-${currentMonth}-${currentDay}`;

    // 2. RESTRICTION: Opening Date cannot be in the past
    dateOuvEl.min = todayString;

    // If user typed/selected an older opening date, reset it to today automatically
    if (dateOuvEl.value && dateOuvEl.value < todayString) {
        dateOuvEl.value = todayString;
        showToast("La date d'ouverture ne peut pas être dans le passé.", "error");
    }

    // 3. RESTRICTION: Opening Time cannot be in the past if Opening Date is Today
    if (dateOuvEl.value === todayString) {
        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentTimeString = `${currentHours}:${currentMinutes}`;

        tempsOuvEl.min = currentTimeString;

        if (tempsOuvEl.value && tempsOuvEl.value < currentTimeString) {
            tempsOuvEl.value = currentTimeString;
            showToast("L'heure d'ouverture ne peut pas être dans le passé.", "error");
        }
    } else {
        // Reset time restriction if date is set to a future day
        tempsOuvEl.removeAttribute("min");
    }

    // 4. RESTRICTION: Closing Date must be greater than or equal to Opening Date
    if (dateOuvEl.value) {
        dateClotEl.min = dateOuvEl.value;
        if (dateClotEl.value && dateClotEl.value < dateOuvEl.value) {
            dateClotEl.value = dateOuvEl.value;
        }
    }

    // 5. RESTRICTION: Closing Time must be after Opening Time if Closing Date matches Opening Date
    if (dateOuvEl.value && dateClotEl.value && dateOuvEl.value === dateClotEl.value) {
        if (tempsOuvEl.value) {
            // Add a small buffer or strict match constraint
            tempsClotEl.min = tempsOuvEl.value;
            if (tempsClotEl.value && tempsClotEl.value <= tempsOuvEl.value) {
                // Advance closing time slightly or alert user
                tempsClotEl.value = "";
                showToast("L'heure de clôture doit être postérieure à l'heure d'ouverture.", "error");
            }
        }
    } else {
        tempsClotEl.removeAttribute("min");
    }
}

async function submitCreateElection(event) {
    event.preventDefault();
    const feedback = document.getElementById("create-election-feedback");
    const submitBtn = document.getElementById("submit-create-election");
    feedback.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Création...";

    const votesField = parseInt(document.getElementById("nombre-votes-autorises").value, 10);
    const affichageRadio = document.querySelector('input[name="affichage-resultats"]:checked');
    const candidats = getCandidateNames();
    const adminEmail = getAdminEmail();

    if (!adminEmail) {
        feedback.textContent = tAdmin("errSessionMissingEmail");
        feedback.className = "text-sm font-medium text-red-600";
        submitBtn.disabled = false;
        submitBtn.textContent = "Créer l'élection";
        return;
    }

    const openDate = document.getElementById("date-ouverture").value;
    const openTime = document.getElementById("temps-ouverture").value;
    const closeDate = document.getElementById("date-cloture").value;
    const closeTime = document.getElementById("temps-cloture").value;
    const openAt = new Date(`${openDate}T${openTime}:00`);
    const closeAt = new Date(`${closeDate}T${closeTime}:00`);

    const setError = (msg) => {
        feedback.textContent = msg;
        feedback.className = "text-sm font-medium text-red-600";
        submitBtn.disabled = false;
        submitBtn.textContent = "Créer l'élection";
    };

    if (isNaN(openAt) || isNaN(closeAt)) return setError(tAdmin("electionFeedbackInvalidDate"));

    // ─── Live Validation Restrictions ────────────────────────────────────────
    const now = new Date();

    // 1. Prevent scheduling an opening date/time that has already passed
    if (openAt < now) {
        return setError("La date et l'heure d'ouverture ne peuvent pas être dans le passé.");
    }

    // 2. Prevent scheduling a closing date/time that has already passed
    if (closeAt < now) {
        return setError("La date et l'heure de clôture ne peuvent pas être dans le passé.");
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (closeAt <= openAt) return setError(tAdmin("electionFeedbackCloseAfterOpen"));
    if (!candidats.length) return setError(tAdmin("electionFeedbackNeedCandidate"));
    if (hasEmptyCandidateField()) return setError(tAdmin("electionFeedbackEmptyCandidateField"));

    const payload = {
        admin_email: adminEmail,
        titre: document.getElementById("election-titre").value.trim(),
        date_ouverture: openDate,
        temps_ouverture: openTime,
        date_cloture: closeDate,
        temps_cloture: closeTime,
        candidats,
        nombre_votes_autorises: Number.isFinite(votesField) && votesField >= 1 ? votesField : 1,
        affichage_resultats: affichageRadio ? affichageRadio.value : "complet",
    };

    try {
        const privateKeyHex = sessionStorage.getItem("admin_private_pkcs8_b64");
        if (!privateKeyHex) {
            return setError(
                "Session de signature manquante. Déconnectez-vous puis reconnectez-vous (page administrateur) pour créer une élection."
            );
        }

        const prepareResponse = await fetch(`${API_BASE_URL}/api/admin/elections/prepare`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify(payload),
        });
        const prepareData = await prepareResponse.json();
        if (!prepareResponse.ok) return setError(prepareData.detail || "Préparation impossible.");

        const signature = await signP256Hex(privateKeyHex, `${prepareData.h_p}||${prepareData.q_election}`);

        const confirmResponse = await fetch(`${API_BASE_URL}/api/admin/elections/confirm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ session_id: prepareData.session_id, signature }),
        });
        const confirmData = await confirmResponse.json();
        if (!confirmResponse.ok) return setError(confirmData.detail || "Création impossible.");

        feedback.textContent = confirmData.message || "Élection créée avec succès.";
        feedback.className = "text-sm font-medium text-green-600";
        await loadDashboardData();
        setTimeout(closeCreateElectionModal, 1200);
    } catch (error) {
        setError(tAdmin("electionFeedbackServerError"));
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Créer l'élection";
    }
}

/* ─── Dashboard Rendering ────────────────────────── */

function statusBadge(status) {
    if (status === "Active") return "bg-emerald-100 text-emerald-700";
    if (status === "Planifiée") return "bg-indigo-100 text-indigo-700";
    return "bg-slate-200 text-slate-700";
}

function toDate(datePart, timePart) {
    return new Date(`${datePart}T${timePart}:00`);
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days}j ${hours}h ${minutes}min`;
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes} min`;
}

function electionResultsPublished(election) {
    if (!election) return false;
    const flag = election.results_published ?? election.has_results;
    return (
        flag === true ||
        flag === "true" ||
        flag === 1 ||
        flag === "1"
    );
}

function electionIsClosed(election) {
    if (!election) return false;
    if (election.is_closed === 1 || election.is_closed === true || election.is_closed === "1") {
        return true;
    }
    const status = (election.status || "").toLowerCase().trim();
    return status === "clôturée" || status === "cloturee" || status === "closed";
}

function buildTimeline(election) {
    const now = new Date();
    const openAt = toDate(election.date_ouverture, election.temps_ouverture);
    const closeAt = toDate(election.date_cloture, election.temps_cloture);
    const total = Math.max(1, closeAt - openAt);

    if (now < openAt) return { label: `Ouverture dans ${formatDuration(openAt - now)}`, progress: 0 };
    if (now >= closeAt) return { label: "Élection clôturée", progress: 100 };

    const elapsed = now - openAt;
    return { label: `${formatDuration(closeAt - now)} restants`, progress: Math.min(100, Math.max(0, (elapsed / total) * 100)) };
}

function renderDashboard(data) {
    const list = document.getElementById("elections-list");
    list.innerHTML = "";

    if (!data.elections.length) {
        list.innerHTML = '<div class="xl:col-span-2 p-8 rounded-2xl border border-slate-200 bg-white text-slate-400 text-center card-shadow">Aucune élection créée pour le moment.</div>';
        return;
    }

    data.elections.forEach((election) => {
        const timeline = buildTimeline(election);
        const card = document.createElement("div");
        card.className = "bg-white p-7 rounded-3xl border border-slate-100 card-shadow flex flex-col justify-between";

        const isClosed = electionIsClosed(election);
        const isPublished = electionResultsPublished(election);
        const isClosedNotPublished = isClosed && !isPublished;

        // Condition pour afficher ou masquer le bouton de gestion des demandes
        const manageButtonHtml = !isClosed ? `
            <div class="flex items-end justify-end shrink-0">
                <button onclick="viewElectionRequests('${election.id}', '${escapeHtml(election.titre.replace(/'/g, "\\'"))}')"
                  class="w-full lg:w-auto h-fit flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold hover:bg-indigo-600 hover:text-white hover:border-indigo-600 shadow-sm transition-all text-sm whitespace-nowrap">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                   </svg>
                   <span data-i18n="btnManageRequests">Gérer les demandes</span>
                </button>
            </div>
        ` : ''; // Si l'élection est clôturée, on n'affiche rien

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-5">
                    <div><h4 class="font-bold text-slate-800 text-lg">${escapeHtml(election.titre)}</h4></div>
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${statusBadge(election.status)}">${escapeHtml(election.status)}</span>
                </div>

                <div class="flex flex-wrap gap-2 mb-4">
                    <span class="text-xs font-semibold px-3 py-1 rounded-full bg-violet-50 text-violet-800 border border-violet-100">${election.nombre_votes_autorises ?? 1} vote(s) autorisé(s) / électeur</span>
                    <span class="text-xs font-semibold px-3 py-1 rounded-full bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-100">Résultats : ${escapeHtml(election.affichage_resultats_label || "Complet")}</span>
                </div>

                <div class="grid grid-cols-2 gap-3 text-sm mb-5">
                    <div class="bg-slate-50 rounded-xl p-3"><p class="text-slate-500">Ouverture</p><p class="font-semibold text-slate-800">${escapeHtml(election.date_ouverture)} ${escapeHtml(election.temps_ouverture)}</p></div>
                    <div class="bg-slate-50 rounded-xl p-3"><p class="text-slate-500">Clôture</p><p class="font-semibold text-slate-800">${escapeHtml(election.date_cloture)} ${escapeHtml(election.temps_cloture)}</p></div>
                </div>

                <div class="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 text-sm mb-5">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 flex-grow">
                        <div class="bg-indigo-50 rounded-xl p-3"><p class="text-indigo-600">Candidats</p><p class="font-bold text-indigo-800 text-lg">${election.candidat_count}</p></div>
                        <div class="bg-blue-50 rounded-xl p-3"><p class="text-blue-600">Participants</p><p class="font-bold text-blue-800 text-lg">${election.participation_count}</p></div>
                        <div class="bg-amber-50 rounded-xl p-3"><p class="text-amber-600">Votes</p><p class="font-bold text-amber-800 text-lg">${election.vote_count}</p></div>
                        <div class="bg-emerald-50 rounded-xl p-3"><p class="text-emerald-600">Participation</p><p class="font-bold text-emerald-800 text-lg">${election.turnout_rate}%</p></div>
                    </div>

                    ${manageButtonHtml}
                </div>
            </div>

            <div>
                <div class="mt-2">
                    <div class="flex justify-between items-center text-xs mb-2">
                        <p class="text-slate-500 font-semibold">Timeline</p>
                        <p class="text-slate-600 font-semibold">${timeline.label}</p>
                    </div>
                    <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full" style="width:${timeline.progress}%"></div>
                    </div>
                </div>

                <div class="mt-4 pt-4 border-t border-slate-100">
                    ${isClosedNotPublished ? `
                        <button type="button" class="dep-launch-btn w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-slate-800 to-indigo-900 hover:opacity-95 shadow-lg transition-all" data-eid="${election.id}">
                            Dépouiller
                        </button>
                    ` : ""}

                    ${isClosed && isPublished ? `
                        <button type="button" class="see-results-btn w-full py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg transition-all flex items-center justify-center gap-2" data-eid="${election.id}">
                            ${ADMIN_EYE_ICON_SVG}
                            <span>Voir résultats</span>
                        </button>
                    ` : ""}
                </div>
            </div>
        `;
        list.appendChild(card);
    });

    // ─── GESTIONNAIRES D'ÉVÉNEMENTS SÉCURISÉS ───
    document.querySelectorAll(".dep-launch-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.eid;
            if (id) runDepouillementFlow(id);
        });
    });

    document.querySelectorAll(".see-results-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.eid;
            if (id) openElectionResultsView(id);
        });
    });
}

/* ─── Data Loaders ───────────────────────────────── */

async function loadDashboardData() {
    const feedback = document.getElementById("dashboard-feedback");
    if (!feedback) return; // Guard against missing DOM element

    feedback.textContent = typeof tAdmin === "function" ? tAdmin("dashboardLoading") : "Chargement...";
    feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/25 text-white";

    try {
        const adminEmail = getAdminEmail();
        if (!adminEmail) {
            feedback.textContent = typeof tAdmin === "function" ? tAdmin("dashboardInvalidSession") : "Session invalide.";
            feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-700";
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/admin/elections/dashboard?admin_email=${encodeURIComponent(adminEmail)}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            feedback.textContent = data.detail || "Impossible de charger les statistiques.";
            feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-700";
            return;
        }

        lastDashboardData = data;
        renderDashboard(data);

        feedback.textContent = `Dernière mise à jour réussie (${new Date().toLocaleTimeString()})`;
        feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-100 text-emerald-700";
    } catch (error) {
        console.error("Dashboard Fetch Error:", error);
        feedback.textContent = typeof tAdmin === "function" ? tAdmin("dashboardServerError") : "Erreur de connexion serveur.";
        feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-700";
    }
}

async function handleParticipationDecision(participationId, decision) {
    try {
        const adminEmail = getAdminEmail();
        if (!adminEmail) { showToast(tAdmin("actionInvalidSession"), "error"); return; }
        const response = await fetch(`${API_BASE_URL}/api/admin/participations/${participationId}/decision`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ admin_email: adminEmail, decision }),
        });
        const data = await response.json();
        if (!response.ok) { showToast(data.detail || "Action impossible.", "error"); return; }
        showToast(data.message || "Décision enregistrée.", "success");
        await loadDashboardData();
    } catch (error) {
        showToast(tAdmin("actionServerError"), "error");
    }
}

/**
 * Displays pending registration requests filtered for a specific election
 */
/**
 * Displays pending registration requests filtered for a specific election
 * Using the existing openActionView modal system natively available in the script
 */
/**
 * Displays pending registration requests filtered for a specific election
 */
async function viewElectionRequests(electionId, electionTitle) {
    const initialLoadingSkeleton = `
        <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
    `;

    // Open the native modal panel
    openActionView(`Demandes de participation — ${electionTitle}`, initialLoadingSkeleton);

    const container = document.getElementById("action-view-body") || document.getElementById("action-view-content");
    if (!container) return;

    try {
        const adminEmail = getAdminEmail();
        const url = `${API_BASE_URL}/api/admin/participations/pending?admin_email=${encodeURIComponent(adminEmail)}`;

        const res = await fetch(url, {
            headers: { "ngrok-skip-browser-warning": "true" }
        });

        if (!res.ok) throw new Error(`Status: ${res.status}`);

        const rawData = await res.json().catch(() => ({ pending: [] }));

        // 1. Target the 'pending' array directly from the response object
        const arrayToFilter = Array.isArray(rawData.pending) ? rawData.pending : [];

        // 2. Filter using the exact 'election_id' key from your backend log
        const targetElectionId = Number(electionId);
        const electionRequests = arrayToFilter.filter(req => Number(req.election_id) === targetElectionId);

        if (electionRequests.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-slate-500">
                    <svg class="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="font-medium text-slate-600">Aucune demande de participation en attente pour cette élection.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="overflow-x-auto mt-4">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 tracking-wider">
                            <th class="px-6 py-3">Électeur</th>
                            <th class="px-6 py-3">Email</th>
                            <th class="px-6 py-3">Statut</th>
                            <th class="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 text-sm">
        `;

        electionRequests.forEach(req => {
            // 3. Mapping variables to match your exact raw data structural fields
            const idParticipation = req.participation_id;
            const voterEmail = req.elector_email || "Inconnu";
            const displayName = req.elector_nom || voterEmail.split('@')[0];
            const status = (req.statut || req.status || 'En attente').toUpperCase();

            html += `
                <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-6 py-4 font-medium text-slate-900">${escapeHtml(displayName)}</td>
                    <td class="px-6 py-4 text-slate-500">${escapeHtml(voterEmail)}</td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
                            ${status}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                        <!-- Use safe lowercase decisions ('accept'/'refuse') and the correct participation ID -->
                        <button onclick="processElectionRequest('${idParticipation}', 'accept', '${electionId}', '${escapeHtml(electionTitle)}')" class="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-md hover:bg-emerald-600 hover:text-white transition-all">Accepter</button>
                        <button onclick="processElectionRequest('${idParticipation}', 'refuse', '${electionId}', '${escapeHtml(electionTitle)}')" class="px-2.5 py-1 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-600 hover:text-white transition-all">Refuser</button>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;

    } catch (err) {
        console.error("Error inside viewElectionRequests:", err);
        container.innerHTML = `
            <div class="text-center py-12 text-red-600 font-medium">
                Impossible de charger les demandes. Erreur de communication serveur.
            </div>
        `;
    }
}

function closeResultsModal() {
    resultsTarget = null;
    document.getElementById("results-overlay").classList.add("hidden");
}

/**
 * Handles decision processing targeting your true endpoint routing architecture
 */
async function processElectionRequest(requestId, decision, electionId, electionTitle) {
    try {
        const adminEmail = getAdminEmail();
        // Using your exact backend action routing url schema
        const url = `${API_BASE_URL}/api/admin/participations/${requestId}/decision`;

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify({ admin_email: adminEmail, decision: decision }) //
        });

        if (!res.ok) throw new Error("Decision routing transaction failed");

        // Modify the toast line inside processElectionRequest:
           showToast(decision === 'accept' ? "Demande approuvée avec succès !" : "Demande refusée.");

        // Refresh underlying dashboard layouts and sync the current modal viewport view
        loadDashboardData();
        viewElectionRequests(electionId, electionTitle);
    } catch (error) {
        console.error("Error processing request decision:", error);
        showToast("Erreur lors du traitement de la demande.", "error");
    }
}

/**
 * Fonction globale appelée par le bouton "Fermer" du footer de l'overlay d'action
 */
function closeVerificationModal() {
    // Exécute la fonction native qui gère le masquage de l'overlay
    closeActionView();
}

// Liaison explicite à l'objet global window pour éviter les erreurs "Uncaught ReferenceError"
window.closeVerificationModal = closeVerificationModal;

async function afficherTableauAuditGlobal(electionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/public/elections/${electionId}/published-results`);
        if (!response.ok) throw new Error("Erreur lors du chargement des données d'audit.");

        const data = await response.json();
        if (!isAffichageComplet(data)) {
            const panel = document.getElementById("audit-panel");
            if (panel) {
                panel.innerHTML = '<p class="text-sm text-slate-500">Vérification globale disponible uniquement pour le type d\'affichage « Complet ».</p>';
            }
            return;
        }
        const verification = data?.verification_globale || {};
        const hashListe = verification?.hash_liste_bulletins || "-";
        const signatureAdmin = verification?.signature_administrateur || "-";
        const cleAdmin = verification?.cle_publique_administrateur || "-";
        const bulletins = Array.isArray(data?.bulletins) ? data.bulletins : [];
        const integrityOk = await verifyGlobalHash(bulletins, hashListe);

        // Génération de l'en-tête contenant les clés de l'élection et les signatures admin
        const headerHtml = `
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 font-mono text-xs text-slate-700 space-y-2">
                <p class="font-bold text-sm font-sans text-slate-900">🔒 Registre Cryptographique Global</p>
                <div class="break-all"><strong>Hash de la Liste (Urne H(L)) :</strong> <span class="text-indigo-600">${hashListe}</span></div>
                <div class="break-all"><strong>Clé Publique Administrateur :</strong> ${cleAdmin}</div>
                <div class="break-all"><strong>Signature Élection Administrateur :</strong> <span class="text-emerald-600">${signatureAdmin}</span></div>
                <div><strong>Statut d'intégrité :</strong> <span class="${integrityOk ? "text-emerald-600" : "text-red-600"} font-bold">${integrityOk ? "Intégrité vérifiée" : "Données altérées !"}</span></div>
                <div><strong>Candidat choisi :</strong> <span class="text-slate-600">colonne « Candidat choisi » du tableau ci-dessous</span></div>
            </div>
        `;

        // Génération des lignes du tableau d'affichage des bulletins
        let tableRowsHtml = "";
        tableRowsHtml = buildAdminBulletinsAuditRows(bulletins) || "";

        const tableHtml = `
            ${headerHtml}
            <div class="overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                            <th class="p-3">Index</th>
                            <th class="p-3">hash_bulletin_chiffré</th>
                            <th class="p-3">signature_bulletin_chiffré</th>
                            <th class="p-3">clé_publique_électeur</th>
                            <th class="p-3">candidat_choisi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml || '<tr><td colspan="5" class="p-4 text-center text-slate-400 font-sans">Aucun bulletin enregistré dans cette urne.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        // Injecter le code généré dans votre conteneur d'interface (div id="audit-panel")
        document.getElementById("audit-panel").innerHTML = tableHtml;

    } catch (error) {
        console.error("🔴 Échec de l'affichage de l'audit :", error);
    }
}

/* ─── Logique de Suppression d'Élection ────────────────── */

/* ─── Logique de Suppression d'Élection ────────────────── */

function openDeleteElectionModal() {
    // Récupération des données synchronisées du State global de votre application
    const elections = lastDashboardData?.elections || [];

    if (elections.length === 0) {
        showToast("Aucune élection disponible pour le moment.", "error");
        return;
    }

    // Génération des lignes du tableau de manière synchrone
    const tableRows = elections.map((el) => {
        // Résolution de sécurité pour la casse des clés de vos modèles (id / ID)
        const currentId = el.ID || el.id;
        const currentTitre = el.Titre || el.titre || `Élection #${currentId}`;
        const dateO = el.Date_Ouverture || el.date_ouverture || "-";
        const tempsO = el.Temps_Ouverture || el.temps_ouverture || "";
        const dateC = el.Date_Clôture || el.date_cloture || "-";
        const tempsC = el.Temps_Clôture || el.temps_cloture || "";
        const statutLabel = el.Statut || el.status || "Inconnu";

        let statusColors = "bg-slate-100 text-slate-600 border-slate-200";
        if (statutLabel === "Active" || statutLabel === "En cours") {
            statusColors = "bg-green-50 text-green-700 border-green-200";
        } else if (statutLabel === "Clôturée" || statutLabel === "Terminée") {
            statusColors = "bg-rose-50 text-rose-700 border-rose-200";
        }

        return `
            <tr class="border-t border-slate-100 hover:bg-slate-50/60 transition-colors text-slate-700 text-sm">
                <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(currentTitre)}</td>
                <td class="py-3 px-4 text-slate-500 text-xs">${escapeHtml(dateO)} ${escapeHtml(tempsO)}</td>
                <td class="py-3 px-4 text-slate-500 text-xs">${escapeHtml(dateC)} ${escapeHtml(tempsC)}</td>
                <td class="py-3 px-4">
                    <span class="inline-block px-2 py-0.5 text-[10px] uppercase tracking-wide font-bold border rounded-md ${statusColors}">
                        ${escapeHtml(statutLabel)}
                    </span>
                </td>
                <td class="py-3 px-4 text-center">
                    <button type="button" onclick="window.handleRequestDeleteElection(${currentId}, '${escapeHtml(currentTitre.replace(/'/g, "\\'"))}')"
                            class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl text-xs shadow-sm transition flex items-center gap-1 mx-auto">
                        Supprimer
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    // Intégration du tableau dans la vue modale d'action générique de votre projet
    const modalContentHtml = `
        <div class="overflow-x-auto border border-slate-200 rounded-xl mt-2">
            <table class="w-full text-left border-collapse text-sm">
                <thead>
                    <tr class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                        <th class="py-3 px-4">Nom</th>
                        <th class="py-3 px-4">Ouverture</th>
                        <th class="py-3 px-4">Clôture</th>
                        <th class="py-3 px-4">Statut</th>
                        <th class="py-3 px-4 text-center">Actions possibles</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;

    // Utilisation de votre fonction native pour afficher le panneau
    openActionView("Supprimer une élection", modalContentHtml);
}

function closeDeleteElectionModal() {
    // Utilisation de votre fonction native pour fermer le panneau d'action
    closeActionView();
}

// Rattachement de l'action à window (Requis pour l'appel inline onclick créé plus haut)
window.handleRequestDeleteElection = async function(electionId, electionTitle) {
    if (!electionId) {
        showToast("Identifiant de l'élection manquant.", "error");
        return;
    }

    // Utilisation de votre composant asynchrone de confirmation natif
    const confirmed = await askConfirmation({
        title: "Action Critique",
        message: `Êtes-vous absolument sûr de vouloir supprimer définitivement l'élection "${electionTitle}" ? Tous les bulletins chiffrés et enregistrements d'audit associés seront purgés.`
    });

    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/elections/${electionId}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true" // Conserve l'accès transparent via Ngrok
            }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Le serveur a refusé l'ordre de suppression.");
        }

        showToast(`L'élection "${electionTitle}" a été supprimée avec succès.`, "success");

        // Fermeture automatique de la vue
        closeDeleteElectionModal();

        // Commande de rafraîchissement global de votre dashboard
        await loadDashboardData();

    } catch (error) {
        console.error("❌ [Delete Crash] :", error);
        showToast(error.message, "error");
    }
};

/* ─── Initialisation & Événements Globaux ───────────────────── */

/**
 * Initialise l'ensemble de l'interface du tableau de bord d'administration,
 * centralise les liaisons d'événements et lance les premiers chargements de données.
 */
function initAdminDashboard() {
    // 1. Événements existants (Gestion des élections & navigation)
    bindIfPresent("open-create-election-modal", "click", openCreateElectionModal);
    bindIfPresent("admin-open-profile", "click", openAdminProfile);
    bindIfPresent("admin-profile-close", "click", closeAdminProfile);
    bindIfPresent("admin-language-toggle-header", "click", toggleAdminLanguage);
    bindIfPresent("quick-create-election", "click", openCreateElectionModal);
    bindIfPresent("close-create-election-modal", "click", closeCreateElectionModal);
    bindIfPresent("cancel-create-election", "click", closeCreateElectionModal);
    bindIfPresent("create-election-form", "submit", submitCreateElection);
    bindIfPresent("add-candidat-btn", "click", () => addCandidateField());
    bindIfPresent("quick-manage-candidates", "click", openCandidatesView);
    bindIfPresent("quick-stats", "click", openStatsView);
    bindIfPresent("quick-results", "click", openQuickResultsView);
    bindIfPresent("action-view-close", "click", closeActionView);
    bindIfPresent("date-ouverture", "change", enforceScheduleConstraints);
    bindIfPresent("temps-ouverture", "change", enforceScheduleConstraints);
    bindIfPresent("date-cloture", "change", enforceScheduleConstraints);
    // À insérer à la fin de la fonction setupEventListeners()
    // À insérer à l'intérieur de la fonction setupEventListeners()
    bindIfPresent("quick-delete-election", "click", openDeleteElectionModal);
    bindIfPresent("close-delete-modal-btn", "click", closeDeleteElectionModal);
    bindIfPresent("close-delete-modal-footer", "click", closeDeleteElectionModal);
    // Trouvez cette ligne existante dans setupEventListeners() :
    bindIfPresent("action-view-close", "click", closeActionView);

// AJOUTEZ CETTE LIGNE JUSTE EN DESSOUS :
    bindIfPresent("action-view-close-footer", "click", closeActionView);
    // 2. Profil admin (email / mot de passe)
    bindIfPresent("admin-open-profile-btn", "click", openAdminProfileModal);
    bindIfPresent("admin-profile-modal-close", "click", closeAdminProfileModal);
    bindIfPresent("admin-toggle-email-panel", "click", toggleAdminEmailPanel);
    bindIfPresent("admin-toggle-password-panel", "click", toggleAdminPasswordPanel);
    bindIfPresent("admin-submit-email-change", "click", saveAdminEmailChange);
    bindIfPresent("admin-send-password-otp", "click", sendAdminPasswordOtp);
    bindIfPresent("admin-verify-password-otp", "click", verifyAdminPasswordOtp);
    bindIfPresent("admin-submit-password-change", "click", saveAdminPasswordChange);
    bindIfPresent("admin-logout-btn", "click", handleLogout);

    const profileOverlay = document.getElementById("admin-profile-overlay");
    if (profileOverlay && !profileOverlay.dataset.boundBackdrop) {
        profileOverlay.dataset.boundBackdrop = "1";
        profileOverlay.addEventListener("click", (e) => {
            if (e.target.id === "admin-profile-overlay") closeAdminProfileModal();
        });
    }

    // 3. Logique d'initialisation de l'état de l'application
    resetCandidateFields();

    enforceScheduleConstraints();
    applyAdminLanguage();
    loadAdminIdentity();

    // Premier chargement asynchrone des données
    loadDashboardData();

    if (!sessionStorage.getItem("admin_private_pkcs8_b64")) {
        showToast(
            "Clé de signature absente : reconnectez-vous pour créer une élection ou lancer un dépouillement.",
            "error"
        );
    }

    // 4. Planification du rafraîchissement automatique (60 secondes)
    setInterval(() => {
        loadDashboardData();
    }, 60000);
}

// Déclenchement sécurisé dès que le DOM est pleinement chargé
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminDashboard);
} else {
    initAdminDashboard();
}