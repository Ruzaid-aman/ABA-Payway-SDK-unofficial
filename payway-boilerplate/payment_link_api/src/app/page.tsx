'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface HashData {
  request_time: string
  merchant_auth_json: string
  merchant_auth_encrypted: string
  hash: string
}

interface ApiResponse {
  response: any
}

export default function Home() {
  const [createForm, setCreateForm] = useState({
    title: 'Test Link 001',
    amount: '0.02',
    description: 'Payment link created from curl',
    payment_limit: '0',
    return_url: 'https://6291d7e1cd0c91932b68dab7.mockapi.io/pushback/api/v1/response/pushbacks',
    merchant_ref_no: 'ref00001'
  })

  const [detailId, setDetailId] = useState('T+ErECeC9uCGj90ylqGUvw==')
  const [createHash, setCreateHash] = useState<HashData | null>(null)
  const [detailHash, setDetailHash] = useState<HashData | null>(null)
  const [createResult, setCreateResult] = useState<any>(null)
  const [detailResult, setDetailResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const copyToClipboard = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(
        typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      )
    } catch {
      // ignore
    }
  }

  const calculateCreateHash = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/calculate-create-hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      })
      const data = await response.json()
      setCreateHash(data)
    } catch (error) {
      console.error('Error calculating hash:', error)
    }
    setLoading(false)
  }

  const createPaymentLink = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      })
      const data = await response.json()
      setCreateResult(data)
    } catch (error) {
      console.error('Error creating payment link:', error)
    }
    setLoading(false)
  }

  const calculateDetailHash = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/calculate-detail-hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detailId })
      })
      const data = await response.json()
      setDetailHash(data)
    } catch (error) {
      console.error('Error calculating hash:', error)
    }
    setLoading(false)
  }

  const getPaymentLinkDetail = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/detail-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detailId })
      })
      const data = await response.json()
      setDetailResult(data)
    } catch (error) {
      console.error('Error getting payment link detail:', error)
    }
    setLoading(false)
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">PayWay Payment Link API Tester</h1>
        <p className="subtitle">Create payment links, inspect hash inputs, and fetch link details from the PayWay sandbox.</p>
        <div className="header-actions">
          <span className="rounded-full border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            Sandbox
          </span>
          <Link href="/qr">
            <Button variant="outline" size="sm" className="btn btn-ghost">
              KHQR JS Checkout
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="grid">
        {/* Create Payment Link */}
        <div>
          <details open>
            <summary>Create Payment Link</summary>
            <p className="help-text">Update values, calculate the hash, then submit to the PayWay API.</p>
            <form onSubmit={(e) => e.preventDefault()}>
              <fieldset>
                <legend>Payment Link Details</legend>
                <div className="field-grid">
                  <div className="field">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={createForm.title}
                      onChange={(e) => setCreateForm({...createForm, title: e.target.value})}
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={createForm.amount}
                      onChange={(e) => setCreateForm({...createForm, amount: e.target.value})}
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="payment_limit">Payment Limit</Label>
                    <Input
                      id="payment_limit"
                      type="number"
                      value={createForm.payment_limit}
                      onChange={(e) => setCreateForm({...createForm, payment_limit: e.target.value})}
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="merchant_ref_no">Merchant Reference No</Label>
                    <Input
                      id="merchant_ref_no"
                      value={createForm.merchant_ref_no}
                      onChange={(e) => setCreateForm({...createForm, merchant_ref_no: e.target.value})}
                    />
                  </div>
                </div>
                <div className="field">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={createForm.description}
                    onChange={(e) => setCreateForm({...createForm, description: e.target.value})}
                    rows={3}
                  />
                </div>
                <div className="field">
                  <Label htmlFor="return_url">Return URL</Label>
                  <Input
                    id="return_url"
                    value={createForm.return_url}
                    onChange={(e) => setCreateForm({...createForm, return_url: e.target.value})}
                  />
                </div>
              </fieldset>

              <div className="flex flex-wrap gap-2">
                <Button onClick={calculateCreateHash} disabled={loading} className="btn btn-ghost">
                  Calculate Hash
                </Button>
                <Button onClick={createPaymentLink} disabled={loading} className="btn btn-primary">
                  Create Payment Link
                </Button>
              </div>

              {createHash && (
                <div className="mt-4">
                  <Label>Hash Calculation Result</Label>
                  <Textarea
                    value={JSON.stringify(createHash, null, 2)}
                    readOnly
                    rows={8}
                  />
                  <div className="copy-btn-wrapper">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(createHash)}
                      className="btn btn-ghost"
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy Hash
                    </Button>
                  </div>
                </div>
              )}

              {createResult && (
                <div className="mt-4">
                  <Label>API Response</Label>
                  <Textarea
                    value={JSON.stringify(createResult.response, null, 2)}
                    readOnly
                    rows={8}
                  />
                  <div className="copy-btn-wrapper">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(createResult.response)}
                      className="btn btn-ghost"
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy Response
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </details>
        </div>

        {/* Get Payment Link Details */}
        <div>
          <details open>
            <summary>Get Payment Link Details</summary>
            <p className="help-text">Retrieve details for an existing payment link</p>
            <form onSubmit={(e) => e.preventDefault()}>
              <fieldset>
                <legend>Payment Link ID</legend>
                <div className="field">
                  <Label htmlFor="detail-id">Payment Link ID</Label>
                  <Input
                    id="detail-id"
                    value={detailId}
                    onChange={(e) => setDetailId(e.target.value)}
                  />
                </div>
              </fieldset>

              <div className="flex flex-wrap gap-2">
                <Button onClick={calculateDetailHash} disabled={loading} className="btn btn-ghost">
                  Calculate Hash
                </Button>
                <Button onClick={getPaymentLinkDetail} disabled={loading} className="btn btn-primary">
                  Get Details
                </Button>
              </div>

              {detailHash && (
                <div className="mt-4">
                  <Label>Hash Calculation Result</Label>
                  <Textarea
                    value={JSON.stringify(detailHash, null, 2)}
                    readOnly
                    rows={8}
                  />
                  <div className="copy-btn-wrapper">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(detailHash)}
                      className="btn btn-ghost"
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy Hash
                    </Button>
                  </div>
                </div>
              )}

              {detailResult && (
                <div className="mt-4">
                  <Label>API Response</Label>
                  <Textarea
                    value={JSON.stringify(detailResult.response, null, 2)}
                    readOnly
                    rows={8}
                  />
                  <div className="copy-btn-wrapper">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(detailResult.response)}
                      className="btn btn-ghost"
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy Response
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </details>
        </div>
      </div>
    </div>
  )
}