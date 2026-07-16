import { NextRequest, NextResponse } from 'next/server'
import { merchant_id, api_key, encryption } from '../../../../helper'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const request_time = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '').slice(0, 14)
    const merchant_auth = {
      'mc_id': merchant_id,
      'id': body.id || 'T+ErECeC9uCGj90ylqGUvw==',
    }

    const merchant_auth_json = JSON.stringify(merchant_auth)
    const merchant_auth_encrypted = encryption(merchant_auth_json, "public_key", 'rsa.public')
    const hash = encryption(request_time + merchant_id + merchant_auth_encrypted, "sha512_true", api_key)

    return NextResponse.json({
      request_time,
      merchant_auth_json,
      merchant_auth_encrypted,
      hash
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}