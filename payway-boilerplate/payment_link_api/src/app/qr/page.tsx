'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Copy, Loader2, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface GenerateResponse {
  request_params: any
  hash_input: string
  response: any
}

const defaultForm = {
  amount: '0.01',
  currency: 'USD',
  payment_option: 'abapay_khqr',
  purchase_type: 'purchase',
  qr_image_template: 'template2',
  callback_url: 'https://6291d7e1cd0c91932b68dab7.mockapi.io/pushback/api/v1/response/pushbacks',
}

export default function QrCheckout() {
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const updateField = (key: keyof typeof defaultForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const copyToClipboard = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(
        typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      )
    } catch {
      // ignore clipboard errors
    }
  }

  const qrImageSrc = useMemo(() => {
    const raw = result?.response?.qr_image || result?.response?.qrImage || result?.response?.qr
    if (raw && typeof raw === 'string') {
      if (raw.startsWith('data:image')) return raw
      return `data:image/png;base64,${raw}`
    }
    return null
  }, [result])

  const generateQr = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/generate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to generate QR')
      }
      setResult(data)
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
      setResult(null)
    }
    setLoading(false)
  }

  const resetForm = () => {
    setForm(defaultForm)
    setResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_20%_0%,hsl(var(--primary)/0.12),transparent_55%),radial-gradient(1200px_circle_at_80%_10%,hsl(var(--ring)/0.10),transparent_50%)]">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <QrCode className="h-4 w-4" />
              QR Checkout (API)
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Generate KHQR with JavaScript</h1>
            <p className="text-sm text-muted-foreground">
              Build the request on the server, send to PayWay sandbox, and preview the QR.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/">
              <Button variant="outline" className="w-full sm:w-auto">Payment Link Demo</Button>
            </Link>
            <Button variant="ghost" onClick={resetForm} className="w-full sm:w-auto">Reset</Button>
            <ThemeToggle />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Request Builder</CardTitle>
              <CardDescription>Fill in the payment info and generate the QR code via the sandbox API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => updateField('amount', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <select
                    id="currency"
                    value={form.currency}
                    onChange={(e) => updateField('currency', e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="USD">USD</option>
                    <option value="KHR">KHR</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payment_option">Payment option</Label>
                  <select
                    id="payment_option"
                    value={form.payment_option}
                    onChange={(e) => updateField('payment_option', e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="abapay_khqr">abapay_khqr</option>
                    <option value="payway">payway</option>
                    <option value="creditcard">creditcard</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchase_type">Purchase type</Label>
                  <select
                    id="purchase_type"
                    value={form.purchase_type}
                    onChange={(e) => updateField('purchase_type', e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="purchase">purchase</option>
                    <option value="cashout">cashout</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="qr_image_template">QR template</Label>
                  <select
                    id="qr_image_template"
                    value={form.qr_image_template}
                    onChange={(e) => updateField('qr_image_template', e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="template1">template1</option>
                    <option value="template2">template2</option>
                    <option value="template3">template3</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="callback_url">Callback URL</Label>
                  <Input
                    id="callback_url"
                    value={form.callback_url}
                    onChange={(e) => updateField('callback_url', e.target.value)}
                    placeholder="https://your-site.com/notify"
                  />
                  <p className="text-xs text-muted-foreground">The server base64-encodes this URL before signing the request.</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button onClick={generateQr} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Generate QR
                </Button>
                <Button variant="outline" onClick={() => copyToClipboard(form)} className="flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  Copy payload
                </Button>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Response & Hash</CardTitle>
              <CardDescription>Inspect what was sent and see the QR payload from PayWay.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!result && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Generate a QR to see the hash input, request params, and API response here.
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">Hash input</div>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => copyToClipboard(result.hash_input)}>
                      <Copy className="mr-2 h-4 w-4" /> Copy
                    </Button>
                  </div>
                  <pre className="max-h-24 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
                    {result.hash_input}
                  </pre>

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">Request params</div>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => copyToClipboard(result.request_params)}>
                      <Copy className="mr-2 h-4 w-4" /> Copy
                    </Button>
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
                    {JSON.stringify(result.request_params, null, 2)}
                  </pre>

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">API response</div>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => copyToClipboard(result.response)}>
                      <Copy className="mr-2 h-4 w-4" /> Copy
                    </Button>
                  </div>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
                    {JSON.stringify(result.response, null, 2)}
                  </pre>

                  {qrImageSrc && (
                    <div className="space-y-2 rounded-xl border bg-background/70 p-4 text-center backdrop-blur">
                      <div className="text-sm font-medium">QR preview</div>
                      <div className="flex justify-center">
                        <img src={qrImageSrc} alt="Generated QR" className="h-auto w-48 rounded-lg border bg-white p-2 shadow-sm" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
