export function Header() {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3.5l1.45 4.05L17.5 9l-4.05 1.45L12 14.5l-1.45-4.05L6.5 9l4.05-1.45L12 3.5zM18.5 14l.75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75L18.5 14zM5.5 13l.65 1.85L8 15.5l-1.85.65L5.5 18l-.65-1.85L3 15.5l1.85-.65L5.5 13z"
                fill="currentColor"
              />
            </svg>
          </span>
          <div className="brand-copy">
            <h1>AIGC Creative Studio</h1>
            <p>AI 图片创作工作台</p>
          </div>
        </div>
        <button type="button" className="history-button">
          生成历史
        </button>
      </div>
    </header>
  )
}
