import type { Dispatch, FormEvent, SetStateAction } from 'react'
import {
  aspectRatios,
  imageCounts,
  stylePresets,
  type GenerationFormData,
} from '../types/generation'

interface GenerationFormProps {
  formData: GenerationFormData
  onChange: Dispatch<SetStateAction<GenerationFormData>>
  onSubmit: () => void
  showNotice: boolean
}

export function GenerationForm({
  formData,
  onChange,
  onSubmit,
  showNotice,
}: GenerationFormProps) {
  const updateField = <Key extends keyof GenerationFormData>(
    key: Key,
    value: GenerationFormData[Key],
  ) => {
    onChange((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <section className="panel form-panel" aria-labelledby="parameters-title">
      <div className="panel-heading">
        <h2 id="parameters-title">创作参数</h2>
        <p>描述你的想法，调整生成偏好</p>
      </div>

      <form className="generation-form" onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label" htmlFor="prompt">
            Prompt
          </label>
          <textarea
            className="field-control"
            id="prompt"
            value={formData.prompt}
            onChange={(event) => updateField('prompt', event.target.value)}
            placeholder="描述你想要创作的画面、主体与氛围"
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="negative-prompt">
            Negative Prompt <span className="optional-label">（可选）</span>
          </label>
          <textarea
            className="field-control"
            id="negative-prompt"
            value={formData.negativePrompt}
            onChange={(event) =>
              updateField('negativePrompt', event.target.value)
            }
            placeholder="填写不希望出现在画面中的内容"
          />
        </div>

        <fieldset className="field-group">
          <legend>图片比例</legend>
          <div className="choice-grid">
            {aspectRatios.map((ratio) => (
              <div className="choice-item" key={ratio}>
                <input
                  className="choice-input"
                  id={`ratio-${ratio.replace(':', '-')}`}
                  type="radio"
                  name="aspectRatio"
                  value={ratio}
                  checked={formData.aspectRatio === ratio}
                  onChange={() => updateField('aspectRatio', ratio)}
                />
                <label
                  className="choice-label"
                  htmlFor={`ratio-${ratio.replace(':', '-')}`}
                >
                  {ratio}
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="field-group">
          <legend>生成数量</legend>
          <div className="choice-grid count-grid">
            {imageCounts.map((count) => (
              <div className="choice-item" key={count}>
                <input
                  className="choice-input"
                  id={`count-${count}`}
                  type="radio"
                  name="imageCount"
                  value={count}
                  checked={formData.imageCount === count}
                  onChange={() => updateField('imageCount', count)}
                />
                <label className="choice-label" htmlFor={`count-${count}`}>
                  {count}
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="form-row">
          <div className="field-group">
            <label className="field-label" htmlFor="seed">
              Seed
            </label>
            <input
              className="field-control"
              id="seed"
              type="number"
              inputMode="numeric"
              value={formData.seed}
              onChange={(event) => updateField('seed', event.target.value)}
              placeholder="随机"
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="style-preset">
              风格预设
            </label>
            <select
              className="field-control"
              id="style-preset"
              value={formData.stylePreset}
              onChange={(event) =>
                updateField(
                  'stylePreset',
                  event.target.value as GenerationFormData['stylePreset'],
                )
              }
            >
              {stylePresets.map((style) => (
                <option value={style} key={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="generate-button" type="submit">
          开始生成
        </button>

        {showNotice && (
          <p className="static-notice" role="status">
            静态页面阶段：尚未接入图片生成服务
          </p>
        )}
      </form>
    </section>
  )
}
