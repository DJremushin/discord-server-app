const styleChips = document.querySelectorAll(".style-filters .chip");
const rankChips = document.querySelectorAll(".rank-filters .chip");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const cardGrid = document.querySelector("#cardGrid");

let activeStyles = [];
let activeRanks = [];
let currentKeyword = "";

function getCurrentUser() {
  return window.currentUser || null;
}

function filterCards() {
  const allCards = document.querySelectorAll(".party-card");

  allCards.forEach((card) => {
    const styles = (card.dataset.style || "").split(" ").filter(Boolean);
    const ranks = (card.dataset.rank || "").split(" ").filter(Boolean);
    const text = card.innerText.toLowerCase();
    const keyword = currentKeyword.toLowerCase();

    const matchStyle =
      activeStyles.length === 0 ||
      activeStyles.every((s) => styles.includes(s));

    const matchRank =
      activeRanks.length === 0 ||
      activeRanks.every((r) => ranks.includes(r));

    const matchKeyword =
      keyword === "" || text.includes(keyword);

    card.style.display =
      matchStyle && matchRank && matchKeyword ? "block" : "none";
  });
}

function deletePost(id) {
  const currentUser = getCurrentUser();
  const savedPosts = JSON.parse(localStorage.getItem("apexPosts")) || [];

  const targetPost = savedPosts.find((post) => String(post.id) === String(id));
  if (!targetPost) return;

  if (!currentUser || String(targetPost.authorId) !== String(currentUser.id)) {
    alert("この投稿は削除できません");
    return;
  }

  const updatedPosts = savedPosts.filter(
    (post) => String(post.id) !== String(id)
  );

  localStorage.setItem("apexPosts", JSON.stringify(updatedPosts));

  cardGrid.innerHTML = "";
  renderSavedPosts();
  filterCards();
}

styleChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const value = chip.dataset.filter;

    if (value === "all") {
      activeStyles = [];
      styleChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    } else {
      chip.classList.toggle("active");

      activeStyles = Array.from(styleChips)
        .filter(
          (c) =>
            c.classList.contains("active") &&
            c.dataset.filter !== "all"
        )
        .map((c) => c.dataset.filter);

      const allChip = document.querySelector('.style-filters .chip[data-filter="all"]');
      if (allChip) {
        allChip.classList.remove("active");
      }

      if (activeStyles.length === 0 && allChip) {
        allChip.classList.add("active");
      }
    }

    filterCards();
  });
});

rankChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const value = chip.dataset.rank;

    if (value === "all") {
      activeRanks = [];
      rankChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    } else {
      chip.classList.toggle("active");

      activeRanks = Array.from(rankChips)
        .filter(
          (c) =>
            c.classList.contains("active") &&
            c.dataset.rank !== "all"
        )
        .map((c) => c.dataset.rank);

      const allChip = document.querySelector('.rank-filters .chip[data-rank="all"]');
      if (allChip) {
        allChip.classList.remove("active");
      }

      if (activeRanks.length === 0 && allChip) {
        allChip.classList.add("active");
      }
    }

    filterCards();
  });
});

if (searchForm && searchInput) {
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    currentKeyword = searchInput.value.trim();
    filterCards();
  });

  searchInput.addEventListener("input", () => {
    currentKeyword = searchInput.value.trim();
    filterCards();
  });
}

function renderSavedPosts() {
  if (!cardGrid) return;

  const currentUser = getCurrentUser();
  const savedPosts = JSON.parse(localStorage.getItem("apexPosts")) || [];

  savedPosts.forEach((post) => {
    const article = document.createElement("article");
    article.className = "party-card";
    article.dataset.style = post.styles || "";
    article.dataset.rank = post.category || "";

    const styleTags = (post.styles || "")
      .split(" ")
      .filter(Boolean)
      .map((style) => `<span>${style}</span>`)
      .join("");

    const isOwner =
      currentUser && String(post.authorId) === String(currentUser.id);

    const ownerActions = isOwner
      ? `
        <a href="create.html?id=${post.id}" class="btn btn-secondary">編集</a>
        <button class="btn btn-secondary delete-btn" data-id="${post.id}">
          削除
        </button>
      `
      : "";

    article.innerHTML = `
      <div class="party-top">
        <div>
          <p class="party-rank">${post.category}</p>
          <h3><a href="detail.html?id=${post.id}">${post.title}</a></h3>
        </div>
        <span class="party-status open">${post.status}</span>
      </div>

      <p class="party-text">${post.description}</p>

      <div class="party-tags">
        ${styleTags}
      </div>

      <div class="party-meta">
        <span>メンバー数 ${post.members}人</span>
        <span>${post.time}</span>
      </div>

      <div class="party-meta">
        <span>投稿者 ${post.authorName || "不明"}</span>
      </div>

      <div class="party-actions">
        <a href="detail.html?id=${post.id}" class="btn btn-primary">詳細</a>
        ${ownerActions}
      </div>
    `;

    cardGrid.prepend(article);
  });

  const deleteButtons = document.querySelectorAll(".delete-btn");

  deleteButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;

      if (confirm("この募集を削除しますか？")) {
        deletePost(id);
      }
    });
  });
}

async function initPage() {
  if (typeof loadMe === "function") {
    await loadMe();
  }

  renderSavedPosts();
  filterCards();
}

initPage();