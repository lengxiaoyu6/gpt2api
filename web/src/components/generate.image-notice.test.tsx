import React, { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const generateImage = vi.fn()
const editImage = vi.fn()
const detectSourceImageFormat = vi.fn()
const convertHEICToJPEG = vi.fn()

vi.mock('../api/site', () => ({
  fetchSiteInfo: vi.fn(),
}))

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
}))

vi.mock('../api/me', () => ({
  getMe: vi.fn(),
  getMyCheckinStatus: vi.fn(),
  checkinToday: vi.fn(),
  listMyModels: vi.fn(),
  listMyImageTasks: vi.fn(),
  playGenerateImage: vi.fn(),
  playEditImage: vi.fn(),
}))

vi.mock('../lib/heic', async () => {
  const actual = await vi.importActual<typeof import('../lib/heic')>('../lib/heic')
  return {
    ...actual,
    detectSourceImageFormat,
    convertHEICToJPEG,
  }
})

const storeModule = await import('../store/useStore')
const useStore = storeModule.useStore
const { default: GenerateView } = await import('./views/Generate')

const fakeHEICHeaderBytes = Uint8Array.from([
  0x00, 0x00, 0x00, 0x1c,
  0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63,
  0x00, 0x00, 0x00, 0x00,
  0x6d, 0x69, 0x66, 0x31,
  0x68, 0x65, 0x69, 0x63,
  0x6d, 0x69, 0x61, 0x66,
])

function resetStore() {
  const initial = useStore.getInitialState()
  useStore.setState(initial, true)
  localStorage.clear()
}

describe('generate image notice', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    detectSourceImageFormat.mockReset()
    convertHEICToJPEG.mockReset()
  })

  afterEach(() => {
    resetStore()
  })

  test('generate page renders image notice from site info', () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '当前高峰期生成速度可能波动',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    const notice = screen.getByText('当前高峰期生成速度可能波动')
    const title = screen.getByText('创意实验室')

    expect(notice).toBeInTheDocument()
    expect(screen.queryByText('生图公告')).toBeNull()
    expect(notice.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('generate page shows the original ratio grid and quality labels without resolution text', () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
        { id: 2, slug: 'gpt-image-2', type: 'image', description: '高清模型', image_price_per_call: 2500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    expect(screen.queryByText('选择画布比例')).toBeNull()
    expect(screen.queryByRole('button', { name: '画布比例 1:1 方形 社交媒体' })).toBeNull()
    expect(screen.getByRole('button', { name: '1:1 方形' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3:2 宽幅' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '4:5 标准' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2:3 竖版' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '21:9 超宽屏' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '16:9 宽屏' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '16:9 宽屏' }))
    expect(screen.getByRole('button', { name: '16:9 宽屏' })).toHaveClass('border-primary/50', 'bg-primary/15')
    expect(screen.getByRole('button', { name: '1K' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2K' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '4K' })).toBeInTheDocument()
    expect(screen.queryByText('1024x1024')).toBeNull()
    expect(screen.queryByText('2048x2048')).toBeNull()
    expect(screen.queryByText('2880x2880')).toBeNull()
    expect(screen.getByText('输出质量')).toBeInTheDocument()
    expect(screen.queryByText('Catmull-Rom 插值')).toBeNull()
  })

  test('generate page updates price by selected output quality', async () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        {
          id: 1,
          slug: 'gpt-image-1',
          type: 'image',
          description: '标准模型',
          image_price_per_call: 1500,
          image_price_per_call_2k: 2600,
          image_price_per_call_4k: 4200,
        },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    expect(screen.queryByText('按成功结果计费')).toBeNull()
    expect(screen.queryByText('当前质量价格：0.15 积分 / 张')).toBeNull()
    expect(screen.queryByText('当前 1 张，预计消耗 0.15 积分')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '4K' }))
    expect(screen.queryByText('当前质量价格：0.42 积分 / 张')).toBeNull()
    expect(screen.queryByText('当前 1 张，预计消耗 0.42 积分')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '3 张' }))
    expect(screen.queryByText('当前 3 张，预计消耗 1.26 积分')).toBeNull()
  })

  test('generate page hides output size and count controls when model disables them', () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        {
          id: 1,
          slug: 'single-default-size',
          type: 'image',
          description: '单张默认尺寸模型',
          image_price_per_call: 1500,
          supports_multi_image: false,
          supports_output_size: false,
        },
      ],
      selectedImageModel: 'single-default-size',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    expect(screen.queryByRole('button', { name: '1K' })).toBeNull()
    expect(screen.queryByRole('button', { name: '2K' })).toBeNull()
    expect(screen.queryByRole('button', { name: '4K' })).toBeNull()
    expect(screen.queryByText('输出质量')).toBeNull()
    expect(screen.queryByText('生成张数')).toBeNull()
    expect(screen.queryByText('多张生成会按张数累计扣费')).toBeNull()
  })


  test('generate page shows pc experience hint in image-to-image mode', async () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    expect(screen.queryByText('图生图建议在 PC 端操作，上传和结果对照体验更好')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '图生图' }))

    await waitFor(() => {
      const notice = screen.getByText('图生图建议在 PC 端操作，上传和结果对照体验更好')
      const noticeCard = notice.closest('[data-slot="card"]')

      expect(notice).toBeInTheDocument()
      expect(noticeCard).not.toBeNull()
      expect(noticeCard?.className).toContain('lg:hidden')
    })
  })

  test('generate page hides count controls in image-to-image mode and keeps single-count pricing copy', async () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500, supports_multi_image: true },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)
    fireEvent.click(screen.getByRole('tab', { name: '图生图' }))

    expect(screen.queryByText('生成张数')).toBeNull()
    expect(screen.queryByText('多张生成会按张数累计扣费')).toBeNull()
    expect(screen.queryByText('按成功结果计费')).toBeNull()
    expect(screen.queryByText('当前 1 张，预计消耗 0.15 积分')).toBeNull()
  })

  test('generate page omits idle inspiration placeholder at bottom', () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    expect(screen.queryByText('等待灵感输入')).toBeNull()
    expect(screen.queryByText('生成完成后会自动同步到记录页')).toBeNull()
  })

  test('generate page renders named workbench regions and desktop result placeholder', () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    expect(screen.getByRole('region', { name: '生成参数区' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '生成结果区' })).toBeInTheDocument()
    expect(screen.getByText('结果将在此显示')).toBeInTheDocument()
  })

  test('generate prompt textarea keeps fixed rows and internal scroll', async () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    const textarea = screen.getByPlaceholderText('描述想看到的画面...')

    expect(textarea).toHaveAttribute('rows', '5')
    expect(textarea).toHaveClass(
      'field-sizing-fixed',
      'h-[140px]',
      'max-h-[140px]',
      'overflow-y-auto',
      'resize-none',
      'overscroll-contain',
      'pr-5',
      'prompt-scrollbar',
    )
    expect(textarea).not.toHaveClass('field-sizing-content')

    await act(async () => {
      fireEvent.change(textarea, {
        target: {
          value: Array.from({ length: 20 }, (_, index) => `第 ${index + 1} 行画面描述`).join('\n'),
        },
      })
    })

    expect(textarea).toHaveAttribute('rows', '5')
    expect(textarea).toHaveClass(
      'field-sizing-fixed',
      'h-[140px]',
      'max-h-[140px]',
      'overflow-y-auto',
      'resize-none',
      'overscroll-contain',
      'pr-5',
      'prompt-scrollbar',
    )
    expect(textarea).not.toHaveClass('field-sizing-content')
  })

  test('generate prompt textarea scrollbar utility keeps native scrollbars subtle', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

    expect(css).toContain('.prompt-scrollbar')
    expect(css).toContain('scrollbar-width: thin')
    expect(css).toContain('scrollbar-gutter: stable')
    expect(css).toContain('.prompt-scrollbar::-webkit-scrollbar-thumb')
    expect(css).toContain('.mobile-scroll-surface')
    expect(css).toContain('backdrop-filter: none')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain('.history-card-visibility')
    expect(css).toContain('content-visibility: auto')
  })

  test('generate click shows dismissible submission dialog instead of loading button text', async () => {
    let resolveGenerate: (value: { created: number; data: Array<{ url: string; thumb_url?: string }> }) => void = () => {}
    const pendingGenerate = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGenerate = resolve
        }),
    )

    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage: pendingGenerate,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
      target: { value: '一座海边图书馆' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

    expect(await screen.findByText('任务已经提交')).toBeInTheDocument()
    expect(screen.getByText('可以关闭弹窗，任务完成后可以到记录查询')).toBeInTheDocument()
    expect(screen.queryByText('AI 处理中...')).toBeNull()
    expect(screen.getByText('开始创作').closest('button')).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    await waitFor(() => {
      expect(screen.queryByText('任务已经提交')).toBeNull()
    })

    await act(async () => {
      resolveGenerate({
        created: 1,
        data: [{ url: 'https://example.com/original.png', thumb_url: 'https://example.com/thumb.png' }],
      })
    })

    expect(await screen.findByText('生成结果')).toBeInTheDocument()
    expect(screen.getByAltText('Result 1')).toHaveAttribute('src', 'https://example.com/thumb.png')
    expect(screen.getByRole('link', { name: '下载原图 1' })).toHaveAttribute('href', 'https://example.com/original.png')
  })

  test('generate page shows generation summary before submit', async () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        {
          id: 1,
          slug: 'gpt-image-1',
          type: 'image',
          description: '标准模型',
          image_price_per_call: 1500,
          image_price_per_call_4k: 4200,
        },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    fireEvent.click(screen.getByRole('button', { name: '16:9 宽屏' }))
    fireEvent.click(screen.getByRole('button', { name: '4K' }))
    fireEvent.click(screen.getByRole('button', { name: '3 张' }))
    fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
      target: { value: '未来海岸城市，夕阳，电影感' },
    })

    const summaryTitle = screen.getByText('本次生成摘要')
    const summaryCard = summaryTitle.closest('.rounded-2xl')

    expect(summaryCard).toBeTruthy()
    const summary = within(summaryCard as HTMLElement)

    expect(summary.getByText('生成方式')).toBeInTheDocument()
    expect(summary.getByText('文字生成模式')).toBeInTheDocument()
    expect(summary.getByText('使用模型')).toBeInTheDocument()
    expect(summary.getAllByText('gpt-image-1').length).toBeGreaterThan(0)
    expect(summary.getByText('比例摘要')).toBeInTheDocument()
    expect(summary.getByText('16:9 比例')).toBeInTheDocument()
    expect(summary.getByText('质量摘要')).toBeInTheDocument()
    expect(summary.getByText('4K 档')).toBeInTheDocument()
    expect(summary.getByText('生成数量')).toBeInTheDocument()
    expect(summary.getByText('3 张')).toBeInTheDocument()
    expect(summary.getByText('预计扣费')).toBeInTheDocument()
    expect(summary.getByText('1.26 积分')).toBeInTheDocument()
  })

  test('generate page keeps a compact mobile summary before submit', async () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        {
          id: 1,
          slug: 'gpt-image-1',
          type: 'image',
          description: '标准模型',
          image_price_per_call: 1500,
          image_price_per_call_4k: 4200,
        },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    fireEvent.click(screen.getByRole('button', { name: '16:9 宽屏' }))
    fireEvent.click(screen.getByRole('button', { name: '4K' }))
    fireEvent.click(screen.getByRole('button', { name: '3 张' }))

    const summaryTitle = screen.getByText('本次生成摘要')
    const summaryCard = summaryTitle.closest('.rounded-2xl')

    expect(summaryCard).toBeTruthy()
    const summary = within(summaryCard as HTMLElement)
    const compactSummary = summary.getByTestId('mobile-generation-summary')

    expect(compactSummary).toHaveClass('lg:hidden')
    expect(compactSummary).toHaveTextContent('文生图')
    expect(compactSummary).toHaveTextContent('gpt-image-1')
    expect(compactSummary).toHaveTextContent('16:9')
    expect(compactSummary).toHaveTextContent('4K')
    expect(compactSummary).toHaveTextContent('3张')
    expect(compactSummary).toHaveTextContent('1.26积分')
  })

  test('generate page no longer renders post-submit progress panel from history task', async () => {
    const pendingGenerate = vi.fn().mockResolvedValue({
      created: 1,
      task_id: 'task-100',
      data: [{ url: 'https://example.com/result.png', thumb_url: 'https://example.com/result-thumb.png' }],
      is_preview: true,
    })

    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage: pendingGenerate,
      editImage,
      history: [
        {
          id: 100,
          task_id: 'task-100',
          user_id: 1,
          model_id: 1,
          account_id: 1,
          prompt: '城市天际线',
          n: 2,
          size: '1024x1024',
          status: 'running',
          phase: 'running',
          phase_label: '生成中',
          estimated_credit: 0.3,
          actual_count: 1,
          billing_status: 'partial',
          billing_note: '已成功生成 1 张，按成功结果计费',
          credit_cost: 15,
          image_urls: ['https://example.com/result.png'],
          thumb_urls: ['https://example.com/result-thumb.png'],
          created_at: '2026-04-29T08:00:00Z',
        },
      ],
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
      target: { value: '城市天际线' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

    await screen.findByText('生成结果')
    expect(screen.queryByText('当前进度')).toBeNull()
    expect(screen.queryByText('阶段 3，共 4 阶段')).toBeNull()
    expect(screen.queryByText('计费说明')).toBeNull()
    expect(screen.queryByText('实际返回')).toBeNull()
    expect(screen.queryByText('已成功生成 1 张，按成功结果计费')).toBeNull()
  })

  test('generate result exposes follow-up actions after images are ready', async () => {
    const generateDone = vi.fn().mockResolvedValue({
      created: 1,
      task_id: 'task-101',
      data: [{ url: 'https://example.com/result.png', thumb_url: 'https://example.com/result-thumb.png' }],
      is_preview: false,
    })

    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage: generateDone,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })

    render(<GenerateView />)

    fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
      target: { value: '山谷中的未来建筑' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

    expect(await screen.findByAltText('Result 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '同参数再生成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '基于此图继续编辑' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制本次提示词' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '复制本次提示词' }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('山谷中的未来建筑')
    })
  })

  test('continue edit writes the first result image back into source images', async () => {
    const generateDone = vi.fn().mockResolvedValue({
      created: 1,
      task_id: 'task-102',
      data: [{ url: 'https://example.com/result.png', thumb_url: 'https://example.com/result-thumb.png' }],
      is_preview: false,
    })
    const resultBlob = new Blob(['continued-image'], { type: 'image/png' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(resultBlob),
      headers: {
        get: vi.fn((name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null)),
      },
    })
    const originalCreateObjectURL = URL.createObjectURL

    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage: generateDone,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = vi.fn().mockReturnValue('blob:continued-result')

    try {
      render(<GenerateView />)

      fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
        target: { value: '山谷中的未来建筑' },
      })
      fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

      expect(await screen.findByAltText('Result 1')).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '基于此图继续编辑' }))
      })

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('https://example.com/result.png')
      })
      await waitFor(() => {
        expect(screen.getByAltText('参考图 1')).toHaveAttribute('src', 'blob:continued-result')
      })
      expect(screen.getByRole('tab', { name: '图生图' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...')).toHaveValue('山谷中的未来建筑')
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      vi.unstubAllGlobals()
    }
  })

  test('generate view consumes pending text draft and fills prompt, model, ratio, quality and count', async () => {
    useStore.setState({
      pendingGenerateDraft: {
        source: 'history-repeat',
        mode: 'txt',
        prompt: '历史回填提示词',
        modelSlug: 'gpt-image-2',
        aspectRatio: '16:9',
        quality: '4K',
        count: 3,
        requestedSize: '3840x2160',
      },
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
        { id: 2, slug: 'gpt-image-2', type: 'image', description: '高清模型', image_price_per_call: 2500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
      generateImage,
      editImage,
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
    } as any)

    render(<GenerateView />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('描述想看到的画面...')).toHaveValue('历史回填提示词')
    })
    expect(useStore.getState().selectedImageModel).toBe('gpt-image-2')
    expect(screen.getByRole('button', { name: '16:9 宽屏' })).toHaveClass('border-primary/50')
    expect(screen.getByRole('button', { name: '4K' })).toHaveClass('border-primary/50')
    expect(screen.getByRole('button', { name: '3 张' })).toHaveClass('border-primary/50')
    expect((useStore.getState() as any).pendingGenerateDraft).toBeNull()
  })

  test('generate view consumes pending image draft and loads remote result into source images', async () => {
    const blob = new Blob(['history-image'], { type: 'image/png' })
    const originalCreateObjectURL = URL.createObjectURL

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
      headers: { get: vi.fn(() => 'image/png') },
    }))
    URL.createObjectURL = vi.fn().mockReturnValue('blob:history-source')

    useStore.setState({
      pendingGenerateDraft: {
        source: 'history-continue-edit',
        mode: 'img',
        prompt: '历史图生图提示词',
        modelSlug: 'gpt-image-1',
        requestedSize: '1024x1024',
        quality: '1K',
        referenceImageUrls: ['https://example.com/history-result.png'],
      },
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
      generateImage,
      editImage,
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
    } as any)

    try {
      render(<GenerateView />)

      await waitFor(() => expect(screen.getByRole('tab', { name: '图生图' })).toHaveAttribute('aria-selected', 'true'))
      await waitFor(() => expect(screen.getByAltText('参考图 1')).toHaveAttribute('src', 'blob:history-source'))
      expect(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...')).toHaveValue('历史图生图提示词')
      expect((useStore.getState() as any).pendingGenerateDraft).toBeNull()
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      vi.unstubAllGlobals()
    }
  })

  test('generate view keeps pending image draft available across strict mode remount and still loads source image', async () => {
    const blob = new Blob(['history-image-strict'], { type: 'image/png' })
    const originalCreateObjectURL = URL.createObjectURL

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
      headers: { get: vi.fn(() => 'image/png') },
    }))
    URL.createObjectURL = vi.fn().mockReturnValue('blob:history-source-strict')

    useStore.setState({
      pendingGenerateDraft: {
        source: 'history-continue-edit',
        mode: 'img',
        prompt: '严格模式历史图生图提示词',
        modelSlug: 'gpt-image-1',
        requestedSize: '1024x1024',
        quality: '1K',
        referenceImageUrls: ['https://example.com/history-result-strict.png'],
      },
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
      generateImage,
      editImage,
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
    } as any)

    try {
      render(
        <StrictMode>
          <GenerateView />
        </StrictMode>,
      )

      await waitFor(() => expect(screen.getByRole('tab', { name: '图生图' })).toHaveAttribute('aria-selected', 'true'))
      await waitFor(() => expect(screen.getByAltText('参考图 1')).toHaveAttribute('src', 'blob:history-source-strict'))
      expect(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...')).toHaveValue('严格模式历史图生图提示词')
      expect((useStore.getState() as any).pendingGenerateDraft).toBeNull()
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      vi.unstubAllGlobals()
    }
  })

  test('generate view consumes history-repeat image draft and loads historical reference images', async () => {
    const blob = new Blob(['history-reference'], { type: 'image/png' })
    const originalCreateObjectURL = URL.createObjectURL

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
      headers: { get: vi.fn(() => 'image/png') },
    }))
    URL.createObjectURL = vi.fn().mockReturnValue('blob:history-repeat-source')

    useStore.setState({
      pendingGenerateDraft: {
        source: 'history-repeat',
        mode: 'img',
        prompt: '历史图生图再次生成',
        modelSlug: 'gpt-image-1',
        requestedSize: '1024x1024',
        quality: '1K',
        referenceImageUrls: ['https://example.com/history-reference.png'],
      },
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
      generateImage,
      editImage,
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
    } as any)

    try {
      render(<GenerateView />)

      await waitFor(() => expect(screen.getByRole('tab', { name: '图生图' })).toHaveAttribute('aria-selected', 'true'))
      await waitFor(() => expect(screen.getByAltText('参考图 1')).toHaveAttribute('src', 'blob:history-repeat-source'))
      expect(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...')).toHaveValue('历史图生图再次生成')
      expect((useStore.getState() as any).pendingGenerateDraft).toBeNull()
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      vi.unstubAllGlobals()
    }
  })

  test('repeat generation requires confirmation before submitting again', async () => {
    const generateDone = vi.fn()
      .mockResolvedValueOnce({
        created: 1,
        task_id: 'task-201',
        data: [{ url: 'https://example.com/result-a.png', thumb_url: 'https://example.com/result-a-thumb.png' }],
        is_preview: false,
      })
      .mockResolvedValueOnce({
        created: 1,
        task_id: 'task-202',
        data: [{ url: 'https://example.com/result-b.png', thumb_url: 'https://example.com/result-b-thumb.png' }],
        is_preview: false,
      })

    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage: generateDone,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
      target: { value: '山谷中的未来建筑' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

    expect(await screen.findByAltText('Result 1')).toBeInTheDocument()
    expect(generateDone).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '同参数再生成' }))

    expect(screen.getByText('确认再次生成')).toBeInTheDocument()
    expect(screen.getByText('将使用刚才相同的模型、比例、质量和提示词再次提交任务。')).toBeInTheDocument()
    expect(generateDone).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '确认生成' }))

    await waitFor(() => {
      expect(generateDone).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.queryByText('确认再次生成')).toBeNull()
    })
  })

  test('generate result download triggers file download instead of opening a new page', async () => {
    const blob = new Blob(['image-binary'], { type: 'image/png' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
      headers: {
        get: vi.fn((name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null)),
      },
    })
    const createObjectURL = vi.fn().mockReturnValue('blob:generate-download')
    const revokeObjectURL = vi.fn()
    const clickedDownloads: string[] = []
    const clickedHrefs: string[] = []
    const clickedTargets: string[] = []
    const originalAnchorClick = HTMLAnchorElement.prototype.click
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL

    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage: vi.fn().mockResolvedValue({
        created: 1,
        data: [{ url: 'https://example.com/original.png?sig=abc', thumb_url: 'https://example.com/thumb.png' }],
      }),
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    HTMLAnchorElement.prototype.click = vi.fn(function (this: HTMLAnchorElement) {
      clickedDownloads.push(this.download)
      clickedHrefs.push(this.href)
      clickedTargets.push(this.target)
    }) as unknown as typeof HTMLAnchorElement.prototype.click

    try {
      render(<GenerateView />)

      fireEvent.change(screen.getByPlaceholderText('描述想看到的画面...'), {
        target: { value: '一座海边图书馆' },
      })
      fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

      expect(await screen.findByAltText('Result 1')).toHaveAttribute('src', 'https://example.com/thumb.png')

      await act(async () => {
        fireEvent.click(screen.getByRole('link', { name: '下载原图 1' }))
      })

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('https://example.com/original.png?sig=abc'))
      await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob))
      expect(clickedHrefs).toEqual(['blob:generate-download'])
      expect(clickedTargets).toEqual([''])
      expect(clickedDownloads[0]).toContain('.png')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:generate-download')
    } finally {
      HTMLAnchorElement.prototype.click = originalAnchorClick
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      vi.unstubAllGlobals()
    }
  })

  test('image-to-image upload can be cancelled after selecting a source image', async () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    fireEvent.click(screen.getByRole('tab', { name: '图生图' }))

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['image'], 'source.png', { type: 'image/png' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByAltText('参考图 1')).toHaveAttribute('src', 'blob:preview')
    })

    const sourcePreview = screen.getByAltText('参考图 1')
    expect(sourcePreview).toHaveAttribute('decoding', 'async')
    expect(sourcePreview.className).toContain('lg:group-hover/source:scale-105')
    expect(sourcePreview.className).not.toContain(' group-hover/source:scale-105')

    fireEvent.click(screen.getByRole('button', { name: '取消参考图' }))

    await waitFor(() => {
      expect(screen.queryByAltText('参考图 1')).toBeNull()
    })
    expect(screen.getByText('点击上传参考图')).toBeInTheDocument()
    expect(fileInput.value).toBe('')
  })

  test('image-to-image converts heic source images to jpeg previews before submit', async () => {
    const pendingEditImage = vi.fn().mockResolvedValue({
      created: 1,
      data: [{ url: 'https://example.com/result.png' }],
    })
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage: pendingEditImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    const createObjectURL = vi.fn().mockImplementation((file: File) => `blob:${file.name}`)
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = createObjectURL

    try {
      render(<GenerateView />)

      fireEvent.click(screen.getByRole('tab', { name: '图生图' }))

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(fileInput).toHaveAttribute('accept', '.png,.jpg,.jpeg,.webp,.heic,.heif,image/png,image/jpeg,image/webp,image/heic,image/heif')

      const heicFile = new File(['heic-image'], 'source.heic', { type: 'image/heic' })
      const validFile = new File(['png-image'], 'source.png', { type: 'image/png' })
      const convertedHeicFile = new File(['jpeg-image'], 'source.jpg', { type: 'image/jpeg' })

      detectSourceImageFormat.mockImplementation(async (file: File) => {
        if (file === heicFile) {
          return 'heic'
        }
        if (file === validFile) {
          return 'png'
        }
        return null
      })
      convertHEICToJPEG.mockResolvedValue(convertedHeicFile)

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [heicFile, validFile] } })
      })

      await waitFor(() => {
        expect(screen.getByAltText('参考图 1')).toHaveAttribute('src', 'blob:source.jpg')
      })

      expect(screen.queryByText('提交后将自动转换为 JPG')).toBeNull()
      expect(screen.getByAltText('参考图 2')).toHaveAttribute('src', 'blob:source.png')
      expect(createObjectURL).toHaveBeenCalledTimes(2)
      expect(createObjectURL).toHaveBeenNthCalledWith(1, convertedHeicFile)
      expect(createObjectURL).toHaveBeenNthCalledWith(2, validFile)

      fireEvent.change(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...'), {
        target: { value: '增加电影感光影' },
      })
      fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

      await waitFor(() => {
        expect(pendingEditImage).toHaveBeenCalledTimes(1)
      })
      expect(convertHEICToJPEG).toHaveBeenCalledWith(heicFile)
      expect(pendingEditImage.mock.calls[0][0].files).toEqual([convertedHeicFile, validFile])
    } finally {
      URL.createObjectURL = originalCreateObjectURL
    }
  })

  test('image-to-image converts disguised heic png files before submit', async () => {
    const pendingEditImage = vi.fn().mockResolvedValue({
      created: 1,
      data: [{ url: 'https://example.com/result.png' }],
    })
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage: pendingEditImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    const createObjectURL = vi.fn().mockImplementation((file: File) => `blob:${file.name}`)
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = createObjectURL

    try {
      render(<GenerateView />)

      fireEvent.click(screen.getByRole('tab', { name: '图生图' }))

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const disguisedHeicFile = new File([fakeHEICHeaderBytes], 'comment.png', { type: 'image/png' })
      const convertedHeicFile = new File(['jpeg-image'], 'comment.jpg', { type: 'image/jpeg' })

      detectSourceImageFormat.mockResolvedValue('heic')
      convertHEICToJPEG.mockResolvedValue(convertedHeicFile)

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [disguisedHeicFile] } })
      })

      await waitFor(() => {
        expect(screen.getByAltText('参考图 1')).toHaveAttribute('src', 'blob:comment.jpg')
      })

      fireEvent.change(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...'), {
        target: { value: '提升细节' },
      })
      fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

      await waitFor(() => {
        expect(pendingEditImage).toHaveBeenCalledTimes(1)
      })

      expect(screen.queryByText('提交后将自动转换为 JPG')).toBeNull()
      expect(createObjectURL).toHaveBeenCalledWith(convertedHeicFile)
      expect(pendingEditImage.mock.calls[0][0].files).toEqual([convertedHeicFile])
    } finally {
      URL.createObjectURL = originalCreateObjectURL
    }
  })

  test('image-to-image removes heic source images when conversion fails', async () => {
    const pendingEditImage = vi.fn().mockResolvedValue({
      created: 1,
      data: [{ url: 'https://example.com/result.png' }],
    })
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage: pendingEditImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    detectSourceImageFormat.mockResolvedValue('heic')
    convertHEICToJPEG.mockRejectedValue(new Error('convert failed'))

    render(<GenerateView />)

    fireEvent.click(screen.getByRole('tab', { name: '图生图' }))

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const heicFile = new File(['heic-image'], 'broken.heic', { type: 'image/heic' })

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [heicFile] } })
    })

    await waitFor(() => {
      expect(screen.queryByAltText('参考图 1')).toBeNull()
    })

    expect(screen.queryByText('HEIC 参考图 1')).toBeNull()
    expect(screen.getByText('点击上传参考图')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...'), {
      target: { value: '提升细节' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(pendingEditImage).not.toHaveBeenCalled()
  })

  test('image-to-image shows original-size option only for single source image and submits dynamic size', async () => {
    const pendingEditImage = vi.fn().mockResolvedValue({
      created: 1,
      data: [{ url: 'https://example.com/result.png' }],
    })
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage: pendingEditImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    const originalCreateObjectURL = URL.createObjectURL
    const originalImage = globalThis.Image
    const imageWidth = 1170
    const imageHeight = 2532

    URL.createObjectURL = vi.fn().mockImplementation((file: File) => `blob:${file.name}`)

    class MockImage {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      naturalWidth = imageWidth
      naturalHeight = imageHeight
      private _src = ''

      set src(value: string) {
        this._src = value
        queueMicrotask(() => {
          this.onload?.()
        })
      }

      get src() {
        return this._src
      }
    }

    vi.stubGlobal('Image', MockImage as unknown as typeof Image)

    try {
      render(<GenerateView />)

      fireEvent.click(screen.getByRole('tab', { name: '图生图' }))
      expect(screen.queryByRole('button', { name: '原图尺寸' })).toBeNull()

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['image-1'], 'source-1.png', { type: 'image/png' })

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } })
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '原图尺寸' })).toBeInTheDocument()
      })
      expect(screen.getByText('195:422')).toBeInTheDocument()
      expect(screen.getByText('沿用参考图比例')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '原图尺寸' }))
      fireEvent.change(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...'), {
        target: { value: '保留构图，增强电影感' },
      })
      fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

      await waitFor(() => {
        expect(pendingEditImage).toHaveBeenCalledTimes(1)
      })

      expect(pendingEditImage).toHaveBeenCalledWith(expect.objectContaining({
        size: '696x1506',
      }))

      const secondFile = new File(['image-2'], 'source-2.png', { type: 'image/png' })
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [secondFile] } })
      })

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: '原图尺寸' })).toBeNull()
      })
      expect(screen.getByRole('button', { name: '1:1 方形' })).toHaveClass('border-primary/50', 'bg-primary/15')
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      vi.stubGlobal('Image', originalImage)
    }
  })

  test('image-to-image accepts multiple source images and submits them together', async () => {
    const pendingEditImage = vi.fn().mockResolvedValue({
      created: 1,
      data: [{ url: 'https://example.com/result.png' }],
    })
    useStore.setState({
      siteInfo: {
        'site.name': 'OAI Hub',
        'site.description': 'AI 创作平台',
        'site.logo_url': '',
        'site.footer': '',
        'auth.allow_register': 'true',
        'site.image_notice': '',
      },
      generateImage,
      editImage: pendingEditImage,
      imageModels: [
        { id: 1, slug: 'gpt-image-1', type: 'image', description: '标准模型', image_price_per_call: 1500 },
      ],
      selectedImageModel: 'gpt-image-1',
      setSelectedImageModel: (slug: string | null) => useStore.setState({ selectedImageModel: slug }),
    } as any)

    render(<GenerateView />)

    fireEvent.click(screen.getByRole('tab', { name: '图生图' }))

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const files = [
      new File(['image-1'], 'source-1.png', { type: 'image/png' }),
      new File(['image-2'], 'source-2.png', { type: 'image/png' }),
    ]

    expect(fileInput).toHaveAttribute('multiple')

    fireEvent.change(fileInput, { target: { files } })

    await waitFor(() => {
      expect(screen.getAllByAltText(/^参考图/)).toHaveLength(2)
    })

    fireEvent.change(screen.getByPlaceholderText('描述想要修改、增强或重绘的部分...'), {
      target: { value: '统一为赛博朋克色调' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始创作' }))

    await waitFor(() => {
      expect(pendingEditImage).toHaveBeenCalledWith(expect.objectContaining({ files }))
    })
  })
})
