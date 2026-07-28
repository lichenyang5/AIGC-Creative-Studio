import { useState } from 'react'
import './App.css'
import { GenerationForm } from './components/GenerationForm'
import { Header } from './components/Header'
import { ResultPreview } from './components/ResultPreview'
import type { GenerationFormData } from './types/generation'

const initialFormData: GenerationFormData = {
  prompt: '',
  negativePrompt: '',
  aspectRatio: '1:1',
  imageCount: 1,
  seed: '',
  stylePreset: '写实摄影',
}

function App() {
  const [formData, setFormData] = useState(initialFormData)
  const [showNotice, setShowNotice] = useState(false)

  const handleSubmit = () => {
    console.log('AIGC generation form:', formData)
    setShowNotice(true)
  }

  return (
    <div className="app-shell">
      <Header />
      <main className="workspace">
        <GenerationForm
          formData={formData}
          onChange={setFormData}
          onSubmit={handleSubmit}
          showNotice={showNotice}
        />
        <ResultPreview />
      </main>
    </div>
  )
}

export default App
