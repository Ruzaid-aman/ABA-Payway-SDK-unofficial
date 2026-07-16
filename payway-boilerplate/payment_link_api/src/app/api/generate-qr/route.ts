import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import https from 'https'
import { merchant_id, api_key, encryption } from '../../../../helper'

const formatRequestTime = () => new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '').slice(0, 14)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const req_time = formatRequestTime()
    const tran_id = body.tran_id || `jsqr${Date.now()}`
    const amount = body.amount ?? 0.01
    const currency = body.currency || 'USD'
    const payment_option = body.payment_option || 'abapay_khqr'
    const purchase_type = body.purchase_type || 'purchase'
    const qr_image_template = body.qr_image_template || 'template2'
    const callback_url_plain = body.callback_url || 'https://6291d7e1cd0c91932b68dab7.mockapi.io/pushback/api/v1/response/pushbacks'
    const callback_url = Buffer.from(callback_url_plain).toString('base64')

    const hashInput = `${req_time}${merchant_id}${tran_id}${amount}${purchase_type}${payment_option}${callback_url}${currency}${qr_image_template}`
    const hash = encryption(hashInput, 'sha512_true', api_key)

    const request_params = {
      req_time,
      merchant_id,
      tran_id,
      amount,
      payment_option,
      currency,
      qr_image_template,
      purchase_type,
      callback_url,
      hash,
    }

    const url = 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/generate-qr'

    const response = await axios.post(url, request_params, {
      headers: {
        'Content-Type': 'application/json',
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    })

    return NextResponse.json({
      request_params,
      hash_input: hashInput,
      response: response.data,
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.response?.data || error.message || 'Unknown error',
    }, { status: 500 })
  }
}