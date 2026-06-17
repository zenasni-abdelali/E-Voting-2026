// ═══════════════════════════════════════════════════
//  elector-dashboard.js — E-Voting Elector Dashboard
// ═══════════════════════════════════════════════════

/* ─── Config ─────────────────────────────────────── */
const API_BASE_URL = " https://ff7e-154-121-40-254.ngrok-free.app";

/* ─── State ─────────────────────────────────────── */
let currentElector = null;
let lastDashboardElections = [];
let voteTarget = null;
let resultsTarget = null;
let choiceTarget = null;

/* ─── Utilities ─────────────────────────────────── */

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
    }, 2600);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/* ─── Confirmation Dialog ────────────────────────── */

function askConfirmation({ title, message }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById("confirm-overlay");
        const titleEl = document.getElementById("confirm-title");
        const msgEl = document.getElementById("confirm-message");
        const noBtn = document.getElementById("confirm-no");
        const yesBtn = document.getElementById("confirm-yes");

        if (!overlay || !titleEl || !msgEl || !noBtn || !yesBtn) { resolve(false); return; }

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
                <p class="text-slate-500 text-center mb-8">Êtes-vous sûr de vouloir quitter votre session électeur ?</p>
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
    const ok = await askConfirmation({ title: tElector("CONFIRMATION"), message: tElector("Voulez-vous vraiment quitter ?") });
    if (ok) {
        if (typeof clearElectorVoteSession === "function") await clearElectorVoteSession();
        localStorage.removeItem("evote_user");
        sessionStorage.removeItem("evote_elector_vote_session");
        currentElector = null;
        window.location.href = "index.html";
    }
}

/* ─── Vote Modal ─────────────────────────────────── */

async function refreshVoteUnlockUI() {
    const pwdPanel = document.getElementById("vote-password-panel");
    const banner = document.getElementById("vote-session-banner");
    if (!pwdPanel || !banner || !currentElector) return;
    const ok =
        typeof isElectorSigningReady === "function" &&
        (await isElectorSigningReady(currentElector.email));
    pwdPanel.classList.toggle("hidden", ok);
    banner.classList.toggle("hidden", !ok);
}

function candidateAvatarSvg(optionIndex) {
    const hues = ["#64748b", "#6366f1", "#8b5cf6", "#0d9488", "#0891b2", "#4f46e5"];
    const c1 = hues[optionIndex % hues.length];
    const c2 = hues[(optionIndex + 2) % hues.length];
    return `
        <div class="relative w-14 h-14 rounded-2xl mx-auto mb-3 ring-[3px] ring-white shadow-md" style="background: radial-gradient(circle at 32% 22%, rgba(255,255,255,0.45) 0%, transparent 48%), linear-gradient(145deg, ${c1}, ${c2});">
            <div class="absolute inset-0 flex items-center justify-center">
                <svg class="w-8 h-8 text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 20.625c1.591-4.29 13.909-4.29 15.5 0"/>
                </svg>
            </div>
        </div>`;
}

async function openVoteModal(election, options = {}) {
    const mode = options.mode || "vote";
    const choiceData = options.choiceData || null;
    const isChoiceMode = mode === "choice";

    voteTarget = isChoiceMode ? null : election;
    console.log("=== CONTENU DE VOTETARGET REÇU AU CLIC ===", election);
    choiceTarget = isChoiceMode ? election : null;

    const titleEl = document.getElementById("vote-modal-election-title");
    if (titleEl) titleEl.textContent = election.titre || "Élection";

    const errEl = document.getElementById("vote-modal-error");
    if (errEl) {
        errEl.classList.add("hidden");
        errEl.textContent = "";
    }

    const list = document.getElementById("vote-candidates-list");
    const cands = election.candidats || [];

    if (!list) return;

    list.className = "flex flex-wrap justify-center gap-6 w-full";

    if (!cands.length) {
        list.innerHTML = `
            <div class="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center text-slate-500 text-sm w-full">
                Aucun choix configuré pour cette élection.
            </div>`;
    } else {
        list.innerHTML = cands.map((c, i) => {
            const label = c.nom || `Candidat ${i + 1}`;
            const selected = isChoiceMode && Number(c.id) === Number(choiceData?.candidat_id);
            const cardClass = selected
                ? "border-emerald-400 bg-emerald-50 shadow-lg shadow-emerald-500/10"
                : "border-slate-200 bg-white";
            return `
                <article class="vote-cand-card group min-w-[190px] max-w-[220px] flex flex-col rounded-2xl border ${cardClass} p-5 text-center transition-all duration-200 ${isChoiceMode ? "" : "hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/10"}" data-candidat-id="${c.id}">
                    ${candidateAvatarSvg(i)}
                    <p class="text-lg font-bold ${selected ? "text-emerald-900" : "text-slate-900"} tracking-tight">${escapeHtml(label)}</p>
                    <p class="text-xs font-medium ${selected ? "text-emerald-700" : "text-slate-500"} mt-1.5">Candidat</p>
                    ${isChoiceMode
                        ? selected
                            ? `<div class="mt-5 w-full py-3 rounded-xl text-sm font-bold text-emerald-800 bg-white border border-emerald-300 shadow-sm">&#10003; vote envoyé</div>`
                            : `<div class="mt-5 w-full py-3 rounded-xl text-sm font-semibold text-slate-400 bg-slate-50 border border-slate-200">Non choisi</div>`
                        : `<button type="button" class="vote-candidate-btn mt-5 w-full py-3 rounded-xl text-sm font-bold text-white shadow-md shadow-indigo-900/25 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 hover:from-indigo-500 hover:via-violet-500 hover:to-indigo-500 active:scale-[0.98] transition-all">
                                Voter
                           </button>`}
                </article>`;
        }).join("");

        if (!isChoiceMode) {
            list.querySelectorAll(".vote-candidate-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const id = parseInt(btn.closest("[data-candidat-id]").dataset.candidatId, 10);
                    if (Number.isFinite(id)) submitVoteForCandidate(id, btn);
                });
            });
        }
    }

    document.getElementById("vote-overlay")?.classList.remove("hidden");
}

function closeVoteModal() {
    voteTarget = null;
    choiceTarget = null;
    const list = document.getElementById("vote-candidates-list");
    if (list) list.classList.remove("hidden");
    document.getElementById("vote-modal-choices-label")?.classList.remove("hidden");
    const subtitle = document.getElementById("vote-modal-subtitle");
    if (subtitle) {
        // REFORMULÉ : Plus humain et rassurant concernant la confidentialité à l'écran
        subtitle.textContent = "Votre vote est totalement sécurisé et anonyme. Les noms des candidats sont affichés de manière neutre afin de garantir la stricte confidentialité de votre choix.";
    }
    const panel = document.getElementById("vote-verification-panel");
    if (panel) {
        panel.innerHTML = "";
        panel.classList.add("hidden");
    }
    document.getElementById("vote-overlay")?.classList.add("hidden");
}

async function openIndividualVerificationModal(election, linkageData) {
    choiceTarget = election;
    voteTarget = null;

    const titleEl = document.getElementById("vote-modal-election-title");
    if (titleEl) titleEl.textContent = election?.titre ? `Vérification — ${election.titre}` : "Vérification de mon reçu de vote";

    const subtitle = document.getElementById("vote-modal-subtitle");
    if (subtitle) {
        // REFORMULÉ : Simplification de "contrôle cryptographique de votre bulletin..."
        subtitle.textContent = "Vérification de votre reçu : le système s'assure que votre vote a bien été pris en compte sans jamais révéler votre choix secret.";
    }

    document.documentElement.lang = "fr";
    document.getElementById("vote-modal-choices-label")?.classList.add("hidden");
    const list = document.getElementById("vote-candidates-list");
    if (list) {
        list.innerHTML = "";
        list.classList.add("hidden");
    }

    const errEl = document.getElementById("vote-modal-error");
    if (errEl) {
        errEl.classList.add("hidden");
        errEl.textContent = "";
    }

    document.getElementById("vote-overlay")?.classList.remove("hidden");
    await runChoiceVerification(election, linkageData);
}

/* ─── Results Modal ──────────────────────────────── */

function closeResultsModal() {
    resultsTarget = null;
    const overlay = document.getElementById("results-overlay");
    if (overlay) {
        overlay.classList.add("hidden");
    }
}

function normalizeElectorPublicKey(key) {
    return String(key || "").trim();
}

async function renderResultsData(election, payload) {
    const data = payload?.results || null;
    const rows = Array.isArray(data?.tally) ? data.tally : [];
    const content = document.getElementById("results-content");
    const empty = document.getElementById("results-empty");
    const loading = document.getElementById("results-loading");
    const tableWrap = document.getElementById("results-table-wrap");
    const barsWrap = document.getElementById("results-bars-wrap");
    const dateLine = document.getElementById("results-published-at");

    loading.classList.add("hidden");

    if (!rows.length) {
        empty.classList.remove("hidden");
        content.classList.add("hidden");
        return;
    }

    const totalVotes = rows.reduce((acc, r) => acc + (Number(r.votes) || 0), 0);
    const winnerVotes = Math.max(0, ...rows.map((r) => Number(r.votes) || 0));
    const publishedAt = `${payload?.date_publication || "-"} ${payload?.temps_publication || ""}`.trim();
    if (dateLine) dateLine.textContent = publishedAt;
    empty.classList.add("hidden");
    content.classList.remove("hidden");

    const mode = (election?.affichage_resultats || payload?.affichage_resultats || "").toLowerCase();
    const useTable = mode === "complet" || (!mode && isAffichageComplet(election || payload));

    const detailedRows = rows.map((r) => {
        const votes = Number(r.votes) || 0;
        const pct = totalVotes > 0 ? ((votes * 100) / totalVotes).toFixed(1) : "0.0";
        const isWinner = votes === winnerVotes && winnerVotes > 0;
        const rowClass = isWinner ? "bg-emerald-50/70" : "";
        const nameClass = isWinner ? "text-emerald-800" : "text-slate-800";
        const voteClass = isWinner ? "text-emerald-700 font-bold" : "text-slate-700";
        return `<tr class="border-t border-slate-100 ${rowClass}">
            <td class="py-3 px-4 font-medium ${nameClass}">${escapeHtml(r.nom || `Candidat ${r.candidat_id}`)}${isWinner ? ' <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">(gagnant)</span>' : ""}</td>
            <td class="py-3 px-4 text-center ${voteClass}">${votes}</td>
            <td class="py-3 px-4 text-center text-indigo-600 font-semibold">${pct}%</td>
        </tr>`;
    }).join("");

    const rankingRows = [...rows]
        .sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0))
        .map((r, idx) => {
            const votes = Number(r.votes) || 0;
            const isWinner = votes === winnerVotes && winnerVotes > 0;
            const rowClass = isWinner ? "bg-emerald-50/70" : "";
            const rankClass = isWinner ? "text-slate-700" : "text-slate-700";
            const nameClass = isWinner ? "text-emerald-800 font-bold" : "text-slate-800";
            return `<tr class="border-t border-slate-100 ${rowClass}">
                <td class="py-3 px-4 ${rankClass} font-semibold">${idx + 1}</td>
                <td class="py-3 px-4 font-medium ${nameClass}">${escapeHtml(r.nom || `Candidat ${r.candidat_id}`)}${isWinner ? ' <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">(gagnant)</span>' : ""}</td>
            </tr>`;
        }).join("");

    const tallyTableBody = useTable
        ? `<table class="w-full text-sm">
               <thead><tr class="text-left text-slate-500 bg-white"><th class="py-3 px-4">Candidat</th><th class="py-3 px-4 text-center">Voix</th><th class="py-3 px-4 text-center">Part</th></tr></thead>
               <tbody>${detailedRows}</tbody>
           </table>`
        : `<table class="w-full text-sm">
               <thead><tr class="text-left text-slate-500 bg-white"><th class="py-3 px-4">Rang</th><th class="py-3 px-4">Candidat</th></tr></thead>
               <tbody>${rankingRows}</tbody>
           </table>`;

    tableWrap.innerHTML = `
        <div class="bg-slate-50 px-4 py-2 text-xs text-slate-500 border-b border-slate-200">
            Publication : ${escapeHtml(publishedAt)}
        </div>
        ${tallyTableBody}`;
    tableWrap.classList.remove("hidden");
    barsWrap.classList.add("hidden");

    const electionMeta = {
        affichage_resultats: election?.affichage_resultats || payload?.affichage_resultats,
        affichage_resultats_label: election?.affichage_resultats_label,
    };
    const showGlobalAudit = mode === "complet" || mode === "partielle" || isAffichageComplet({ affichage_resultats: mode });

    const listeBulletins = showGlobalAudit && Array.isArray(payload?.bulletins) ? payload.bulletins : [];

    if (showGlobalAudit && currentElector?.email) {
        try {
            const choiceResp = await fetch(
                `${API_BASE_URL}/api/elector/elections/${election.id}/my-choice?elector_email=${encodeURIComponent(currentElector.email)}`,
                { headers: { "ngrok-skip-browser-warning": "true" } }
            );
            const choiceData = await choiceResp.json().catch(() => ({}));
            if (choiceResp.ok && choiceData.cle_publique_electeur) {
                sessionStorage.setItem(
                    "elector_public_key",
                    normalizeElectorPublicKey(choiceData.cle_publique_electeur)
                );
            }
        } catch (_) {
            /* liaison facultative */
        }
    }

    let verificationHtml = "";
    if (showGlobalAudit) {
        const verification = payload?.verification_globale || {};
        const hashListe = verification?.hash_liste_bulletins || "-";
        const sigAdmin = verification?.signature_administrateur || "-";
        const cleAdmin = verification?.cle_publique_administrateur || "-";
        const isIntegrityValid = await verifyGlobalHash(listeBulletins, hashListe);

        // REFORMULÉ : "Intégrité" -> "Conformité de l'urne numérique"
        const integrityText = isIntegrityValid ? "✅ Urne validée (aucune altération)" : "❌ Données modifiées anormalement !";
        const integrityClass = isIntegrityValid ? "text-emerald-700" : "text-red-700";
        const bulletinsRowsHtml = buildBulletinsAuditRows(listeBulletins);

        verificationHtml = `
    <div class="mt-6 border-t border-slate-200 pt-4">
        <h5 class="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-3">🛡️ Registre de transparence et de contrôle des résultats</h5>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">État de l'urne</p>
                <p id="global-integrity-status" class="${integrityClass} font-bold mt-1">${integrityText}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Votes reçus enregistrés</p>
                <p class="text-slate-800 font-bold mt-1">${listeBulletins.length}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Publication</p>
                <p class="text-slate-800 font-bold mt-1">${escapeHtml(payload?.date_publication || "-")} ${escapeHtml(payload?.temps_publication || "")}</p>
            </div>
        </div>

        <div class="space-y-3">
            <details class="group border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm mb-3">
                <summary class="list-none flex justify-between items-center p-4 bg-slate-50/50 cursor-pointer select-none text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <span>Données de sécurité de l'urne globale</span>
                    <span class="transition group-open:rotate-180 text-slate-400">▼</span>
                </summary>
                <div class="p-4 border-t border-slate-100 bg-white text-xs text-slate-600 space-y-3">
                    <div>
                        <strong class="text-slate-700 block mb-1">hash_liste_bulletins :</strong>
                        <div class="flex gap-1">
                            <input type="text" class="font-mono text-[11px] bg-slate-50 p-1.5 border border-slate-200 rounded w-full" readonly value="${escapeHtml(hashListe)}">
                        </div>
                    </div>
                    <div>
                        <strong class="text-slate-700 block mb-1">Signature numérique de l'administrateur :</strong>
                        <textarea class="font-mono text-[11px] bg-slate-50 p-1.5 border border-slate-200 rounded w-full" rows="2" readonly>${escapeHtml(sigAdmin)}</textarea>
                    </div>
                    <div>
                        <strong class="text-slate-700 block mb-1">Cle publique administrateur :</strong>
                        <input type="text" class="font-mono text-[11px] bg-slate-50 p-1.5 border border-slate-200 rounded w-full" readonly value="${escapeHtml(cleAdmin)}">
                    </div>
                </div>
            </details>

            <details class="group border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm" open>
                <summary class="list-none flex justify-between items-center p-4 bg-slate-50/50 cursor-pointer select-none text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <span>Registre public anonyme (${listeBulletins.length} vote(s))</span>
                    <span class="transition group-open:rotate-180 text-slate-400">▼</span>
                </summary>
                <div class="p-2 border-t border-slate-100 bg-white max-h-72 overflow-y-auto overflow-x-auto">
                    <table class="w-full text-left text-xs border-collapse min-w-[640px]">
                        <thead>
                            <tr class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase">
                                <th class="py-2 px-3 text-center w-10">Numéro</th>
                                <th class="py-2 px-3">Hash_Bulletin_Chiffré</th>
                                <th class="py-2 px-3">Signature_Bulletin_Chiffré</th>
                                <th class="py-2 px-3">Clé_Publique_Electeur</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bulletinsRowsHtml}
                        </tbody>
                    </table>
                </div>
            </details>

        </div>
    </div>
    `;
    }

    const auditContainerId = "results-audit-container-wrapper";
    let auditWrapper = document.getElementById(auditContainerId);
    if (!auditWrapper) {
        auditWrapper = document.createElement("div");
        auditWrapper.id = auditContainerId;
        content.appendChild(auditWrapper);
    } else {
        auditWrapper.innerHTML = "";
    }
    auditWrapper.innerHTML = verificationHtml;
}

const verifyGlobalHash = window.verifyGlobalHash || (async () => false);
const buildBulletinsAuditRows = window.buildBulletinsAuditRows || (() => "");
const isAffichageComplet = window.isAffichageComplet || (() => false);
const verifyElectorBulletinSignature = window.verifyElectorBulletinSignature || (async () => false);
const verifyBulletinHashConsistency = window.verifyBulletinHashConsistency || (async () => false);

const ELECTOR_EYE_ICON_SVG = `<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
</svg>`;

async function openResultsModal(election) {
    resultsTarget = election;
    const titleEl = document.getElementById("results-modal-election-title");
    const loading = document.getElementById("results-loading");
    const empty = document.getElementById("results-empty");
    const content = document.getElementById("results-content");

    titleEl.textContent = election?.titre || "Résultats";
    loading.classList.remove("hidden");
    empty.classList.add("hidden");
    content.classList.add("hidden");
    const staleAudit = document.getElementById("results-audit-container-wrapper");
    if (staleAudit) staleAudit.remove();
    document.getElementById("results-overlay").classList.remove("hidden");

    try {
        const response = await fetch(`${API_BASE_URL}/api/public/elections/${election.id}/published-results`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            loading.classList.add("hidden");
            empty.classList.remove("hidden");
            return;
        }
        await renderResultsData(election, data);
    } catch (_) {
        loading.classList.add("hidden");
        empty.classList.remove("hidden");
    }
}

/* ─── Vote Submission ────────────────────────────── */

async function submitVoteForCandidate(candidatId, triggerBtn) {
    if (!voteTarget || !currentElector) return;

    const errEl = document.getElementById("vote-modal-error");
    if (errEl) errEl.classList.add("hidden");

    if (!Number.isFinite(candidatId)) return;

    const electorEmailRaw = currentElector.email || currentElector.Email || "";
    if (!electorEmailRaw) {
        if (errEl) {
            errEl.textContent = "Erreur : Session électeur invalide (Email manquant). Veuillez vous reconnecter.";
            errEl.classList.remove("hidden");
        }
        return;
    }

    const clePubliqueRaw = String(voteTarget.cle_publique_election || "").trim();
    if (!clePubliqueRaw) {
        if (errEl) {
            // REFORMULÉ
            errEl.textContent = "Erreur de sécurité : L'identifiant sécurisé de l'élection est manquant. Contactez l'administrateur.";
            errEl.classList.remove("hidden");
        }
        return;
    }

    const electionId = parseInt(voteTarget.id || 0);
    const voteOrdinal = parseInt(voteTarget.vote_ordinal || 1);
    const participationId = parseInt(voteTarget.participation_id || 0);

    const labelHtml = triggerBtn.innerHTML;
    // REFORMULÉ : Texte d'attente d'envoi plus naturel
    triggerBtn.innerHTML = "Envoi sécurisé du bulletin…";
    setVoteCandidateButtonsDisabled(true);

    try {
        await submitEncryptedVote({
            email: electorEmailRaw.trim(),
            election_id: electionId,
            participation_id: participationId,
            vote_ordinal: voteOrdinal,
            candidat_id: parseInt(candidatId),
            cle_publique_election: clePubliqueRaw,
        });

        // REFORMULÉ
        showToast(tElector("Votre vote a bien été enregistré !"), "success");

        const dsError = document.getElementById("ds-verification-error") || document.querySelector(".text-red-600");
        if (dsError && (dsError.textContent.includes("BS") || dsError.textContent.includes("bulletin"))) {
            dsError.classList.add("hidden");
        }

        voteTarget.vote_ordinal = voteOrdinal + 1;
        await loadElectorDashboard();

        const ordinalDisplay = document.getElementById("vote-ordinal-display");
        if (ordinalDisplay) {
            // REFORMULÉ
            ordinalDisplay.textContent = `Nombre de votes envoyés : ${voteTarget.vote_ordinal}`;
        }

    } catch (e) {
        if (errEl) {
            console.error("Détails de l'erreur réseau :", e);
            if (e.response && e.response.data && e.response.data.detail) {
                errEl.textContent = "Serveur : " + e.response.data.detail;
            } else if (e.message) {
                errEl.textContent = e.message;
            } else {
                // REFORMULÉ
                errEl.textContent = "Une erreur est survenue lors de l'envoi de votre bulletin.";
            }
            errEl.classList.remove("hidden");
        }
    } finally {
        triggerBtn.innerHTML = labelHtml;
        setVoteCandidateButtonsDisabled(false);
    }
}

function setVoteCandidateButtonsDisabled(disabled) {
    document.querySelectorAll(".vote-candidate-btn").forEach((b) => { b.disabled = disabled; });
}

/* ─── Choice Verification ────────────────────────── */

function renderChoiceVerificationPanel(html) {
    const panel = document.getElementById("vote-verification-panel");
    if (!panel) return;
    panel.innerHTML = html;
    panel.classList.remove("hidden");
}

async function sha256TextHex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyZkpPacket(packet) {
    const proof = String(packet?.proof_pi || "");
    if (!proof.startsWith("ZKP_V1|")) return false;
    const expectedBody = {
        H_B: String(packet.hash_b_hex || "").trim().toLowerCase(),
        N: String(packet.nullifier_hex || "").trim().toLowerCase(),
        election_id: Number(packet.election_id),
        schema: "EVOTE_ZKP_V1",
        status: packet.vote_status || "",
    };
    const canonical = JSON.stringify(expectedBody, Object.keys(expectedBody).sort());
    const expected = `ZKP_V1|${await sha256TextHex(canonical)}`;
    return proof === expected;
}

async function runChoiceVerification(election, choiceData) {
    renderChoiceVerificationPanel(`
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Contrôle du reçu de vote</p>
        <p class="text-sm text-slate-600 mt-2">Recherche de votre reçu anonyme et connexion sécurisée au serveur...</p>
    `);

    try {
        const electionId = parseInt(election.id, 10);
        if (!Number.isFinite(electionId)) {
            throw new Error("Identifiant d'élection incorrect.");
        }

        let electorEmail = "";
        if (typeof currentElector !== "undefined" && currentElector && currentElector.email) {
            electorEmail = currentElector.email;
        } else {
            const rawUserData = localStorage.getItem("evote_user");
            if (rawUserData) {
                try {
                    const parsedUser = JSON.parse(rawUserData);
                    electorEmail = parsedUser.email || "";
                } catch (e) {
                    console.error("📋 Échec de lecture des infos utilisateur :", e);
                }
            }
        }

        if (!electorEmail) {
            electorEmail = localStorage.getItem("user_email") || localStorage.getItem("email") || "";
        }

        if (!electorEmail || electorEmail.trim() === "" || electorEmail === "undefined" || electorEmail === "null") {
            throw new Error("Votre session a expiré ou votre identifiant est introuvable. Veuillez vous reconnecter.");
        }

        electorEmail = electorEmail.trim().toLowerCase();

        let computedN = String(choiceData?.nullifier_hex || "").toLowerCase().trim();
        const isHex64 = /^[0-9a-f]{64}$/.test(computedN);

        if (!isHex64) {
            const sessionIdxDB = await evoteIdbGetSession(electorEmail);
            if (!sessionIdxDB || !sessionIdxDB.nfSalt) {
                throw new Error("Clé de sécurité introuvable pour générer le reçu anonyme. Veuillez vous reconnecter.");
            }

            const participationId = choiceData.participation_id || choiceData.ID_Participation || election.participation_id;
            const voteOrdinal = choiceData.vote_ordinal !== undefined ? choiceData.vote_ordinal : 1;
            if (!participationId) {
                throw new Error("Liaison impossible : Référence d'inscription manquante.");
            }

            console.log("⚙️ Reçu absent du serveur, génération locale en cours...");
            computedN = await wcNullifierDigest(sessionIdxDB.nfSalt, participationId, voteOrdinal);
            computedN = String(computedN).toLowerCase().trim();
        }

        if (!/^[0-9a-f]{64}$/.test(computedN)) {
            throw new Error("Code de reçu invalide.");
        }

        const response = await fetch(`${API_BASE_URL}/api/elector/votes/verify/request`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify({
                elector_email: electorEmail,
                election_id: electionId,
                nullifier_hex: computedN
            })
        });

        if (!response.ok) {
            const errPacket = await response.json().catch(() => ({}));
            throw new Error(errPacket.detail || "Impossible de récupérer votre reçu officiel auprès du serveur.");
        }

        const packet = await response.json();
        const active = String(packet.vote_status || "").toLowerCase() === "actif";
        const clePublique = choiceData?.cle_publique_electeur || packet.cle_publique_electeur || "";
        const bulletinHex = packet.bulletin_hex || "";
        const signatureHex = packet.signature_der_hex || choiceData?.signature_bulletin_chiffre || "";

        const sigValid = active && await verifyElectorBulletinSignature(clePublique, bulletinHex, signatureHex);
        const hashValid = active && await verifyBulletinHashConsistency(bulletinHex, packet.hash_b_hex);
        const zkpValid = active && await verifyZkpPacket(packet);
        const proofValid = sigValid && hashValid && zkpValid;

        const statusClass = proofValid ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50";

        const iconHtml = proofValid
            ? `<div class="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-11 h-11 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                    </svg>
               </div>
               <p class="text-xl font-bold text-emerald-800">Reçu validé avec succès</p>
               <p class="text-sm text-emerald-700 mt-2 max-w-md mx-auto">
                    Le système confirme que votre bulletin est authentique et bien comptabilisé.
               </p>`
            : `<div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-11 h-11 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
               </div>
               <p class="text-xl font-bold text-red-800">Erreur de vérification</p>
               <p class="text-sm text-red-700 mt-2 max-w-md mx-auto">
                    L'authenticité de ce reçu ne peut pas être confirmée.
               </p>`;

        renderChoiceVerificationPanel(`
            <div class="rounded-2xl border ${statusClass} p-6 text-center">
                <p class="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 mb-4">Vérification de mon vote</p>
                ${iconHtml}
                <p class="text-[11px] text-slate-500 mt-4">
                    Signature ${sigValid ? "✓" : "✗"} • Hash ${hashValid ? "✓" : "✗"} • ZKP ${zkpValid ? "✓" : "✗"}
                </p>
            </div>
        `);



    } catch (error) {
        renderChoiceVerificationPanel(`
            <p class="text-xs font-bold uppercase tracking-[0.18em] text-red-700">Contrôle du vote</p>
            <p class="text-sm text-red-700 mt-2">
                ${error.message || "Impossible d'effectuer les contrôles de sécurité pour le moment."}
            </p>
        `);
    }
}

async function confirmChoiceVerification(election, pseudonymN, packet) {
    try {
        const electorEmail = (currentElector?.email || localStorage.getItem("user_email") || "").trim().toLowerCase();
        if (!electorEmail) {
            showToast("Session expirée. Veuillez vous reconnecter.", "error");
            return;
        }
        const cleanN = String(pseudonymN || "").toLowerCase().trim();
        if (!/^[0-9a-f]{64}$/.test(cleanN)) {
            showToast("Code de reçu incorrect.", "error");
            return;
        }
        const eid = parseInt(election?.id, 10);
        if (!Number.isFinite(eid)) {
            showToast("Élection introuvable.", "error");
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/elector/votes/verify/confirm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify({
                elector_email: electorEmail,
                election_id: eid,
                nullifier_hex: cleanN,
                proof_valid: true,
                status: "confirmed",
                reason: "Bulletin validé avec succès par l'électeur"
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Le serveur a refusé la validation.");
        }

        // REFORMULÉ
        showToast("Votre reçu de vote a été validé et archivé.", "success");

        if (typeof closeVoteModal === "function") closeVoteModal();
        await loadElectorDashboard();
    } catch (error) {
        showToast(error.message || "Validation impossible.", "error");
    }
}

async function signalChoiceVerification(election, pseudonymN, packet) {
    // REFORMULÉ : Alerte utilisateur beaucoup plus compréhensible
    const ok = await askConfirmation({
        title: "Signaler un problème sur mon reçu",
        message: "Attention, si vous signalez une anomalie, votre reçu litigieux sera annulé et une demande de vérification approfondie sera envoyée au serveur. Souhaitez-vous continuer ?",
    });
    if (!ok) return;

    try {
        const electorEmail = (currentElector?.email || localStorage.getItem("user_email") || "").trim().toLowerCase();
        if (!electorEmail) {
            showToast("Session expirée. Veuillez vous reconnecter.", "error");
            return;
        }
        const cleanN = String(pseudonymN || "").toLowerCase().trim();
        if (!/^[0-9a-f]{64}$/.test(cleanN)) {
            showToast("Code de reçu incorrect.", "error");
            return;
        }
        const eid = parseInt(election?.id, 10);
        if (!Number.isFinite(eid)) {
            showToast("Élection introuvable.", "error");
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/elector/votes/verify/confirm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify({
                elector_email: electorEmail,
                election_id: eid,
                nullifier_hex: cleanN,
                proof_valid: false,
                status: "error_signaled",
                reason: "Anomalie signalée : l'électeur a révoqué son bulletin"
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Le serveur a rejeté le signalement.");
        }

        // REFORMULÉ
        showToast("Anomalie transmise au serveur. Les mesures de vérification ont été déclenchées.", "success");
        if (typeof closeVoteModal === "function") closeVoteModal();
        await loadElectorDashboard();
    } catch (error) {
        showToast(error.message || "Impossible d'envoyer le signalement.", "error");
    }
}

async function openChoiceModal(election) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/elector/elections/${election.id}/my-choice?elector_email=${encodeURIComponent(currentElector.email)}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { showToast(data.detail || "Impossible de trouver votre reçu de vote.", "error"); return; }
        await openIndividualVerificationModal(election, data);
    } catch (error) {
        showToast(error.message || "Vérification indisponible.", "error");
    }
}

/* ─── Profile Modal ──────────────────────────────── */

function resetElectorPasswordFlow() {
    document.getElementById("elector-pass-step-1")?.classList.remove("hidden");
    document.getElementById("elector-pass-step-2")?.classList.add("hidden");
    document.getElementById("elector-pass-step-3")?.classList.add("hidden");
    const fields = ["elector-password-otp", "elector-new-password", "elector-confirm-password"];
    fields.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
}

function openElectorProfileModal() {
    document.getElementById("elector-profile-name").value = currentElector?.nom || "Électeur";
    document.getElementById("elector-profile-email").value = currentElector?.email || "-";
    document.getElementById("elector-email-change-panel")?.classList.add("hidden");
    document.getElementById("elector-password-change-panel")?.classList.add("hidden");
    resetElectorPasswordFlow();
    document.getElementById("elector-profile-overlay")?.classList.remove("hidden");
}

function closeElectorProfileModal() {
    document.getElementById("elector-profile-overlay")?.classList.add("hidden");
}

function toggleElectorEmailPanel() {
    document.getElementById("elector-password-change-panel")?.classList.add("hidden");
    document.getElementById("elector-email-change-panel")?.classList.toggle("hidden");
}

function toggleElectorPasswordPanel() {
    document.getElementById("elector-email-change-panel")?.classList.add("hidden");
    document.getElementById("elector-password-change-panel")?.classList.toggle("hidden");
    resetElectorPasswordFlow();
}

async function saveElectorEmailChange() {
    const oldEmail = (currentElector?.email || "").trim().toLowerCase();
    const newEmail = (document.getElementById("elector-new-email")?.value || "").trim().toLowerCase();
    const confirmEmail = (document.getElementById("elector-confirm-email")?.value || "").trim().toLowerCase();
    if (!newEmail || !confirmEmail) { showToast(tElector("profileFillEmails"), "error"); return; }

    const response = await fetch(`${API_BASE_URL}/api/elector/profile/change-email`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ current_email: oldEmail, new_email: newEmail, confirm_email: confirmEmail }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Changement email impossible.", "error"); return; }

    currentElector.email = data.email || newEmail;
    localStorage.setItem("evote_user", JSON.stringify(currentElector));
    document.getElementById("elector-email-display").textContent = currentElector.email;
    document.getElementById("elector-profile-email").value = currentElector.email;
    showToast(tElector("profileEmailChanged"), "success");
    document.getElementById("elector-email-change-panel")?.classList.add("hidden");
    await loadElectorDashboard();
}

async function sendElectorPasswordOtp() {
    const response = await fetch(`${API_BASE_URL}/api/elector/password-reset/request`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ email: currentElector.email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Envoi OTP impossible.", "error"); return; }
    showToast(tElector("otpSent"), "success");
    document.getElementById("elector-pass-step-1")?.classList.add("hidden");
    document.getElementById("elector-pass-step-2")?.classList.remove("hidden");
}

async function verifyElectorPasswordOtp() {
    const otp = (document.getElementById("elector-password-otp")?.value || "").trim();
    const response = await fetch(`${API_BASE_URL}/api/elector/password-reset/verify`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ email: currentElector.email, otp }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "OTP invalide", "error"); return; }
    showToast(tElector("otpValidated"), "success");
    document.getElementById("elector-pass-step-2")?.classList.add("hidden");
    document.getElementById("elector-pass-step-3")?.classList.remove("hidden");
}

function electorU8ToB64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
}

async function electorDeriveAesWrapKeyFromPassword(password, saltU8) {
    const pwKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltU8, iterations: 100000, hash: "SHA-256" },
        pwKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["wrapKey", "unwrapKey"]
    );
}

async function buildElectorPasswordResetPayload(newPassword, email) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapKey = await electorDeriveAesWrapKeyFromPassword(newPassword, salt);
    const wrapped = await crypto.subtle.wrapKey("pkcs8", pair.privateKey, wrapKey, { name: "AES-GCM", iv });
    const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
    return {
        email,
        cle_publique: "WC_P256." + electorU8ToB64(new Uint8Array(spki)),
        sel: forge.util.encode64(String.fromCharCode(...salt)),
        iv: forge.util.encode64(String.fromCharCode(...iv)),
        enc_k: JSON.stringify({ v: 3, w: electorU8ToB64(new Uint8Array(wrapped)) }),
    };
}

async function saveElectorPasswordChange() {
    const np = document.getElementById("elector-new-password")?.value || "";
    const cp = document.getElementById("elector-confirm-password")?.value || "";
    if (!np || !cp || np !== cp) { showToast(tElector("pwdMismatch"), "error"); return; }

    const payload = await buildElectorPasswordResetPayload(np, currentElector.email);
    const response = await fetch(`${API_BASE_URL}/api/elector/password-reset/confirm`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Changement mot de passe impossible.", "error"); return; }

    showToast(tElector("pwdChanged"), "success");
    document.getElementById("elector-password-change-panel")?.classList.add("hidden");
    resetElectorPasswordFlow();
}

/* ─── i18n ───────────────────────────────────────── */

const electorI18n = (window.EVOTE_I18N && window.EVOTE_I18N.dictionaries.electorDashboard) || { fr: {}, en: {} };

function getElectorLang() {
    if (window.EVOTE_I18N?.getLanguage) return window.EVOTE_I18N.getLanguage();
    return "fr";
}

function setElectorText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function tElector(key) {
    const lang = getElectorLang();
    const bucket = electorI18n[lang] || electorI18n.fr;
    return bucket[key] || electorI18n.fr[key] || key;
}

function applyElectorLanguage() {
    const lang = getElectorLang();
    const t = electorI18n[lang] || {};
    setElectorText("elector-help-label", t.helpLabel || "Aide");
    setElectorText("elector-participation-title", t.participationTitle || "Participations");
    setElectorText("elector-language-header-label", t.languageHeaderLabel || "Langue");
    document.documentElement.lang = lang === "en" ? "en" : "fr";
    if (currentElector) {
        const welcomeEl = document.getElementById("elector-welcome");
        if (welcomeEl) welcomeEl.textContent = `${t.welcomePrefix || "Bonjour"}, ${currentElector.nom || "Électeur"}`;
    }
}

function toggleElectorLanguage() {
    const next = getElectorLang() === "fr" ? "en" : "fr";
    if (window.EVOTE_I18N?.setLanguage) window.EVOTE_I18N.setLanguage(next);
    else localStorage.setItem("evote_lang", next);
    applyElectorLanguage();
}

/* ─── Identity / Session ─────────────────────────── */

function loadElectorIdentity() {
    const storedUser = JSON.parse(localStorage.getItem("evote_user") || "null");
    if (!storedUser || storedUser.role !== "elector") {
        window.location.href = "Inscription-Electeur.html";
        return false;
    }

    currentElector = storedUser;
    const t = electorI18n[getElectorLang()] || {};

    const welcomeEl = document.getElementById("elector-welcome");
    if (welcomeEl) welcomeEl.textContent = `${t.welcomePrefix || "Bonjour"}, ${storedUser.nom || "Électeur"}`;

    const nameEl = document.getElementById("elector-name-display");
    if (nameEl) nameEl.textContent = storedUser.nom || "Électeur";

    const emailEl = document.getElementById("elector-email-display");
    if (emailEl) emailEl.textContent = storedUser.email || "-";

    return true;
}

/* ─── Dashboard Rendering ────────────────────────── */

function statusStyle(status) {
    if (status === "Active") return "bg-green-100 text-green-700";
    if (status === "Planifiée") return "bg-yellow-100 text-yellow-700";
    return "bg-slate-100 text-slate-600";
}

function participationStyle(status) {
    if (status === "Accepté") return "bg-emerald-100 text-emerald-700";
    if (status === "Refusé") return "bg-red-100 text-red-700";
    if (status === "En attente") return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-600";
}

async function requestParticipation(electionId, adminEmail) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/elector/participations/request`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ elector_email: currentElector.email, admin_email: adminEmail, election_id: electionId }),
        });
        const data = await response.json();
        if (!response.ok) { showToast(data.detail || "Demande impossible.", "error"); return; }
        showToast(tElector("Demande envoyée"), "success");
        await loadElectorDashboard();
    } catch (error) {
        showToast(tElector("serverError"), "error");
    }
}

async function loadElectorDashboard() {
    const feedback = document.getElementById("elector-dashboard-feedback");
    const container = document.getElementById("elector-elections-list");
    if (feedback) feedback.textContent = tElector("loading");
    if (!container) return;
    container.innerHTML = "";

    try {
        const response = await fetch(`${API_BASE_URL}/api/elector/elections/dashboard?elector_email=${encodeURIComponent(currentElector.email)}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await response.json();
        if (!response.ok) {
            if (feedback) {
                feedback.textContent = data.detail || "Impossible de charger les élections.";
                feedback.className = "mt-3 text-sm font-medium text-red-600";
            }
            return;
        }

        if (!data.elections || !data.elections.length) {
            container.innerHTML = '<div class="lg:col-span-2 bg-white rounded-[2rem] p-8 card-shadow text-slate-400 text-center">Aucune élection disponible.</div>';
            if (feedback) feedback.textContent = tElector("noData");
            return;
        }

        const sortedElections = [...data.elections].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
        lastDashboardElections = sortedElections;

        sortedElections.forEach((election) => {
            const canRequest = election.participation_status === "Aucune demande";
            const isAccepted = election.is_accepted ?? (election.participation_status === "Accepté");
            const isActive = election.is_active ?? (election.status === "Active");
            const isClosed = election.is_closed ?? (election.status === "Clôturée");
            const hasVoted = !!election.has_voted;

            const arLabel = election.affichage_resultats_label || "Complet";
            const inhElig = election.eligibility_reason
                ? `<p class="text-xs text-amber-700 mt-2">${escapeHtml(election.eligibility_reason)}</p>`
                : "";

            let actionButtonsHtml = "";

            // MODIFICATION 1 : On affiche "Demander participation" UNIQUEMENT si l'élection n'est PAS clôturée
            if (canRequest && !isClosed) {
                actionButtonsHtml += `
                    <button class="request-btn bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                            data-election-id="${election.id}"
                            data-admin-email="${escapeHtml(election.admin_email)}">
                        Demander participation
                    </button>
                `;
            }

            // MODIFICATION 2 : Tout ce bloc requiert STRICTEMENT d'avoir été "Accepté" (isAccepted)
            if (isAccepted) {
                if (isActive) {
                    actionButtonsHtml += `
                        <button type="button" class="vote-open-btn px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                                data-election-id="${election.id}">
                            ${hasVoted ? "Voter à nouveau" : "Voter"}
                        </button>
                    `;
                }

                if (isClosed) {
                    actionButtonsHtml += `
                        <button type="button" class="results-open-btn px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center justify-center gap-2"
                                data-election-id="${election.id}">
                            ${ELECTOR_EYE_ICON_SVG}
                            <span>Voir résultats</span>
                        </button>
                    `;

                    if (hasVoted) {
                        actionButtonsHtml += `
                            <button type="button" class="choice-open-btn px-4 py-2 rounded-lg text-sm font-semibold bg-slate-600 hover:bg-slate-700 text-white"
                                    data-election-id="${election.id}">
                                Vérifier mon reçu de vote
                            </button>
                        `;
                    }
                }
            }

            const card = document.createElement("div");
            card.className = "bg-white rounded-[2rem] p-6 card-shadow border border-slate-100";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <h3 class="text-xl font-bold text-slate-800">${escapeHtml(election.titre)}</h3>
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${statusStyle(election.status)}">${escapeHtml(election.status)}</span>
                </div>
                <div class="flex flex-wrap gap-2 mb-3">
                    <span class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-fuchsia-50 text-fuchsia-800">Résultats : ${escapeHtml(arLabel)}</span>
                </div>
                <p class="text-sm text-slate-500 mb-2">Administrateur: <span class="font-semibold">${escapeHtml(election.admin_nom || "-")}</span></p>
                <p class="text-sm text-slate-500">Ouverture: ${escapeHtml(election.date_ouverture)} ${escapeHtml(election.temps_ouverture)}</p>
                <p class="text-sm text-slate-500 mb-4">Clôture: ${escapeHtml(election.date_cloture)} ${escapeHtml(election.temps_cloture)}</p>
                <div class="flex flex-wrap items-center gap-2 justify-between">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${participationStyle(election.participation_status)}">${escapeHtml(election.participation_status)}</span>
                    <div class="flex flex-wrap gap-2 justify-end flex-1">
                        ${isAccepted ? `<span class="text-xs font-semibold text-emerald-700 self-center hidden sm:inline mr-1">Accès accordé</span>` : ""}
                        ${actionButtonsHtml}
                    </div>
                </div>
                ${isAccepted && hasVoted && election.eligibility_reason ? `<div class="mt-2">${inhElig}</div>` : ""}
            `;
            container.appendChild(card);
        });

        // Attachement des écouteurs d'événements dynamiques
        document.querySelectorAll(".request-btn").forEach((btn) => {
            btn.addEventListener("click", () => requestParticipation(parseInt(btn.dataset.electionId, 10), btn.dataset.adminEmail));
        });

        document.querySelectorAll(".vote-open-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = parseInt(btn.dataset.electionId, 10);
                const el = lastDashboardElections.find((e) => e.id === id);
                if (el) openVoteModal(el);
            });
        });

        document.querySelectorAll(".results-open-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = parseInt(btn.dataset.electionId, 10);
                const el = lastDashboardElections.find((e) => e.id === id);
                if (el) openResultsModal(el);
            });
        });

        document.querySelectorAll(".choice-open-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = parseInt(btn.dataset.electionId, 10);
                const el = lastDashboardElections.find((e) => e.id === id);
                if (el) openChoiceModal(el);
            });
        });

        if (feedback) {
            feedback.textContent = `Dernière mise à jour (${new Date().toLocaleTimeString()})`;
            feedback.className = "mt-3 text-sm font-medium text-emerald-600";
        }
    } catch (error) {
        if (feedback) {
            feedback.textContent = tElector("serverError");
            feedback.className = "mt-3 text-sm font-medium text-red-600";
        }
    }
}

let currentAuditElectionId = null;

/**
 * Closes the cryptographic audit verification modal
 */
function closeVerificationModal() {
    // 1. Reset state
    choiceTarget = null;

    // 2. Hide the exact modal element matching your HTML ID
    const modal = document.getElementById("vote-overlay");
    if (modal) {
        modal.classList.add("hidden");
    } else {
        console.error("Could not find element with id='verificationModal'");
    }
}

// Make it global so your HTML inline onclick="closeVerificationModal()" can call it
window.closeVerificationModal = closeVerificationModal;

async function openVerificationModal(electionId) {
    const id = parseInt(electionId, 10);
    if (!Number.isFinite(id)) {
        showToast("Identifiant d'élection incorrect.", "error");
        return;
    }
    currentAuditElectionId = id;

    const election = (lastDashboardElections || []).find((e) => Number(e.id) === id);
    if (!election) {
        showToast("Élection introuvable dans votre tableau de bord.", "error");
        return;
    }
    await openChoiceModal(election);
}

async function soumettreDecisionDecision(statusDecision, pseudonymN) {
    const id = Number(currentAuditElectionId);
    const election = (lastDashboardElections || []).find((e) => Number(e.id) === id);
    if (!election) {
        showToast("Élection introuvable.", "error");
        return;
    }
    if (statusDecision === "confirmed") {
        await confirmChoiceVerification(election, pseudonymN, {});
    } else {
        await signalChoiceVerification(election, pseudonymN, {});
    }
}

/* ─── Event Bindings & Init ──────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("elector-open-profile")?.addEventListener("click", openElectorProfileModal);
    document.getElementById("elector-profile-close")?.addEventListener("click", closeElectorProfileModal);
    document.getElementById("elector-edit-email-btn")?.addEventListener("click", toggleElectorEmailPanel);
    document.getElementById("elector-edit-password-btn")?.addEventListener("click", toggleElectorPasswordPanel);
    document.getElementById("elector-save-email-btn")?.addEventListener("click", saveElectorEmailChange);
    document.getElementById("elector-send-otp-btn")?.addEventListener("click", sendElectorPasswordOtp);
    document.getElementById("elector-verify-otp-btn")?.addEventListener("click", verifyElectorPasswordOtp);
    document.getElementById("elector-save-password-btn")?.addEventListener("click", saveElectorPasswordChange);
    document.getElementById("elector-language-toggle-header")?.addEventListener("click", toggleElectorLanguage);
    document.getElementById("results-close-btn")?.addEventListener("click", closeResultsModal);
    document.getElementById("close-verification-modal")?.addEventListener("click", closeVerificationModal);

    const identityLoaded = loadElectorIdentity();

    if (identityLoaded) {
        loadElectorDashboard();
    }
    setInterval(loadElectorDashboard, 60000);
});