import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const generateImage = vi.fn()
const editImage = vi.fn()

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

const storeModule = await import('../store/useStore')
const useStore = storeModule.useStore
const { default: GenerateView } = await import('./views/Generate')

function resetStore() {
  const initial = useStore.getInitialState()
  useStore.setState(initial, true)
  localStorage.clear()
}

describe('generate image notice', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetStore()
  })

  test('generate page renders image notice from site info', () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'GPT2API',
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
        'site.name': 'GPT2API',
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
        'site.name': 'GPT2API',
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

    expect(screen.getByText('当前质量价格：0.15 积分 / 张')).toBeInTheDocument()
    expect(screen.getByText('当前 1 张，预计消耗 0.15 积分')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '4K' }))
    expect(screen.getByText('当前质量价格：0.42 积分 / 张')).toBeInTheDocument()
    expect(screen.getByText('当前 1 张，预计消耗 0.42 积分')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '3 张' }))
    expect(screen.getByText('当前 3 张，预计消耗 1.26 积分')).toBeInTheDocument()
  })

  test('generate page hides output size and count controls when model disables them', () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'GPT2API',
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
        'site.name': 'GPT2API',
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
      expect(screen.getByText('图生图建议在 PC 端操作，上传和结果对照体验更好')).toBeInTheDocument()
    })
  })

  test('generate page omits idle inspiration placeholder at bottom', () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'GPT2API',
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
        'site.name': 'GPT2API',
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

  test('image-to-image upload can be cancelled after selecting a source image', async () => {
    useStore.setState({
      siteInfo: {
        'site.name': 'GPT2API',
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

    fireEvent.click(screen.getByRole('button', { name: '取消参考图' }))

    await waitFor(() => {
      expect(screen.queryByAltText('参考图 1')).toBeNull()
    })
    expect(screen.getByText('点击上传参考图')).toBeInTheDocument()
    expect(fileInput.value).toBe('')
  })

  test('image-to-image accepts multiple source images and submits them together', async () => {
    const pendingEditImage = vi.fn().mockResolvedValue({
      created: 1,
      data: [{ url: 'https://example.com/result.png' }],
    })
    useStore.setState({
      siteInfo: {
        'site.name': 'GPT2API',
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
