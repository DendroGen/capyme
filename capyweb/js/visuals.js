window.Visuals = (() => {
    const poseRows = document.getElementById("pose-rows");
    const emotionRows = document.getElementById("emotion-rows");
    const addPoseRowBtn = document.getElementById("add-pose-row-btn");
    const addEmotionRowBtn = document.getElementById("add-emotion-row-btn");

    function createPreviewHTML(fileUrl) {
        if (!fileUrl) return "";
        return `<div class="visual-preview"><img src="${fileUrl}" alt="preview"></div>`;
    }

    function createRowHTML(type, index, item = {}) {
        const label = item.label || "";
        const description = item.description || "";
        const tags = item.tags || "";
        const existingFile = item.file || "";
        const previewUrl = item.file ? `http://127.0.0.1:5000/uigrounds/${window.App?.getCurrentAgent?.() || ""}/${item.file}` : "";

        const titleText = type === "pose" ? "Poz" : "Duygu";
        const fileLabel = type === "pose" ? "Poz Resmi / GIF" : "Duygu Resmi / GIF";
        const nameLabel = type === "pose" ? "Poz İsmi" : "Duygu İsmi";
        const descLabel = type === "pose" ? "Poz Açıklaması" : "Duygu Açıklaması";

        return `
            <div class="visual-row" data-type="${type}" data-index="${index}">
                <input type="hidden" name="${type}_existing_file_${index}" value="${existingFile}">

                <div class="visual-row-top">
                    <div class="visual-row-title">${titleText} #${index + 1}</div>
                    <button type="button" class="btn secondary small-btn remove-visual-row-btn">Sil</button>
                </div>

                <div class="visual-row-grid">
                    <div class="form-group">
                        <label>${fileLabel}</label>
                        <input type="file" name="${type}_image_${index}" accept="image/*,.gif" class="visual-file-input">
                        <div class="visual-inline-preview">${createPreviewHTML(previewUrl)}</div>
                    </div>

                    <div class="form-group">
                        <label>${nameLabel}</label>
                        <input type="text" name="${type}_label_${index}" value="${label}" placeholder="${type === "pose" ? "Ayakta yakın" : "Utangaç"}">
                    </div>

                    <div class="form-group full">
                        <label>${descLabel}</label>
                        <textarea name="${type}_description_${index}" rows="3" placeholder="Açıklama yaz...">${description}</textarea>
                    </div>

                    <div class="form-group full">
                        <label>Taglar</label>
                        <input type="text" name="${type}_tags_${index}" value="${tags}" placeholder="ör: ayak,kıyafet,oturuyor">
                    </div>
                </div>
            </div>
        `;
    }

    function bindRowEvents(scopeEl) {
        if (!scopeEl) return;

        scopeEl.querySelectorAll(".remove-visual-row-btn").forEach(btn => {
            btn.onclick = (e) => {
                const row = e.target.closest(".visual-row");
                if (row) row.remove();
                reindexAll();
            };
        });

        scopeEl.querySelectorAll(".visual-file-input").forEach(input => {
            input.onchange = (e) => {
                const row = e.target.closest(".visual-row");
                const wrap = row?.querySelector(".visual-inline-preview");
                if (!wrap) return;

                const file = e.target.files?.[0];
                if (!file) return;

                const url = URL.createObjectURL(file);
                wrap.innerHTML = `<div class="visual-preview"><img src="${url}" alt="preview"></div>`;
            };
        });
    }

    function reindexContainer(container, type) {
        if (!container) return;
        const rows = [...container.querySelectorAll(".visual-row")];

        rows.forEach((row, index) => {
            row.dataset.index = index;
            row.innerHTML = createRowHTML(type, index, {
                label: row.querySelector(`[name^="${type}_label_"]`)?.value || "",
                description: row.querySelector(`[name^="${type}_description_"]`)?.value || "",
                tags: row.querySelector(`[name^="${type}_tags_"]`)?.value || "",
                file: row.querySelector(`[name^="${type}_existing_file_"]`)?.value || ""
            }).replace(/^<div class="visual-row"[^>]*>|<\/div>$/g, "");
        });

        bindRowEvents(container);
    }

    function reindexAll() {
        reindexContainer(poseRows, "pose");
        reindexContainer(emotionRows, "emotion");
    }

    function addPoseRow(item = {}) {
        if (!poseRows) return;
        const index = poseRows.querySelectorAll(".visual-row").length;
        poseRows.insertAdjacentHTML("beforeend", createRowHTML("pose", index, item));
        bindRowEvents(poseRows);
    }

    function addEmotionRow(item = {}) {
        if (!emotionRows) return;
        const index = emotionRows.querySelectorAll(".visual-row").length;
        emotionRows.insertAdjacentHTML("beforeend", createRowHTML("emotion", index, item));
        bindRowEvents(emotionRows);
    }

    function clearAll() {
        if (poseRows) poseRows.innerHTML = "";
        if (emotionRows) emotionRows.innerHTML = "";
    }

    function loadAgentVisuals(agentData) {
        clearAll();

        const poses = Array.isArray(agentData?.poses) ? agentData.poses : [];
        const emotions = Array.isArray(agentData?.emotions) ? agentData.emotions : [];

        if (poses.length) {
            poses.forEach(item => addPoseRow(item));
        } else {
            addPoseRow();
        }

        if (emotions.length) {
            emotions.forEach(item => addEmotionRow(item));
        } else {
            addEmotionRow();
        }
    }

    function bindTabs() {
        document.querySelectorAll(".visual-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const tab = btn.dataset.visualTab;

                document.querySelectorAll(".visual-tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                document.querySelectorAll(".visual-tab-content").forEach(c => c.classList.add("hidden"));
                const target = document.getElementById(`visual-tab-${tab}`);
                if (target) target.classList.remove("hidden");
            });
        });
    }

    if (addPoseRowBtn) {
        addPoseRowBtn.addEventListener("click", () => addPoseRow());
    }

    if (addEmotionRowBtn) {
        addEmotionRowBtn.addEventListener("click", () => addEmotionRow());
    }

    bindTabs();

    return {
        addPoseRow,
        addEmotionRow,
        clearAll,
        loadAgentVisuals
    };
})();