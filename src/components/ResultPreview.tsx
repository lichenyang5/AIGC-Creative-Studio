export function ResultPreview() {
  return (
    <section className="panel preview-panel" aria-labelledby="preview-title">
      <div className="panel-heading">
        <h2 id="preview-title">创作结果</h2>
        <p>生成的图片将在此区域呈现</p>
      </div>

      <div className="preview-stage">
        <div className="empty-state">
          <div className="placeholder-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <rect
                x="8"
                y="10"
                width="32"
                height="28"
                rx="4"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <circle cx="18" cy="20" r="3" fill="currentColor" />
              <path
                d="M11.5 34l8.5-8 5.5 5 4.5-4 6.5 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3>生成结果将在这里展示</h3>
          <p>填写左侧参数并开始创作</p>
        </div>
      </div>
    </section>
  )
}
