package com.ababank.payway.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.ababank.payway.R
import com.ababank.payway.model.PaymentOption

/**
 * RecyclerView adapter for displaying payment options.
 *
 * @property options The list of available payment options.
 * @property onOptionSelected Callback when an option is selected.
 */
class PaymentOptionAdapter(
    private val options: List<PaymentOption>,
    private val onOptionSelected: (PaymentOption) -> Unit
) : RecyclerView.Adapter<PaymentOptionAdapter.OptionViewHolder>() {

    private var selectedPosition: Int = -1

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): OptionViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_payment_option, parent, false)
        return OptionViewHolder(view)
    }

    override fun onBindViewHolder(holder: OptionViewHolder, position: Int) {
        val option = options[position]
        holder.bind(option, position == selectedPosition)

        holder.itemView.setOnClickListener {
            val previousSelected = selectedPosition
            selectedPosition = holder.bindingAdapterPosition

            if (previousSelected != -1) {
                notifyItemChanged(previousSelected)
            }
            notifyItemChanged(selectedPosition)

            onOptionSelected(option)
        }
    }

    override fun getItemCount(): Int = options.size

    inner class OptionViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val iconImageView: ImageView = itemView.findViewById(R.id.optionIcon)
        private val nameTextView: TextView = itemView.findViewById(R.id.optionName)

        fun bind(option: PaymentOption, isSelected: Boolean) {
            nameTextView.text = getOptionDisplayName(option)

            val iconRes = getOptionIcon(option)
            iconImageView.setImageResource(iconRes)

            val backgroundColor = if (isSelected) {
                ContextCompat.getColor(itemView.context, R.color.option_selected_background)
            } else {
                ContextCompat.getColor(itemView.context, R.color.option_default_background)
            }
            itemView.setBackgroundColor(backgroundColor)

            val strokeColor = if (isSelected) {
                ContextCompat.getColor(itemView.context, R.color.option_selected_stroke)
            } else {
                ContextCompat.getColor(itemView.context, R.color.option_default_stroke)
            }
            itemView.background.setTint(strokeColor)
        }

        private fun getOptionDisplayName(option: PaymentOption): String = when (option) {
            PaymentOption.ABA_KHQR -> "ABA KHQR"
            PaymentOption.ABA_KHQR_DEEPLINK -> "ABA KHQR (Deeplink)"
            PaymentOption.CARDS -> "Credit/Debit Card"
            PaymentOption.ALIPAY -> "Alipay"
            PaymentOption.WECHAT -> "WeChat Pay"
            PaymentOption.GOOGLE_PAY -> "Google Pay"
        }

        private fun getOptionIcon(option: PaymentOption): Int = when (option) {
            PaymentOption.ABA_KHQR, PaymentOption.ABA_KHQR_DEEPLINK -> R.drawable.ic_aba
            PaymentOption.CARDS -> R.drawable.ic_card
            PaymentOption.ALIPAY -> R.drawable.ic_alipay
            PaymentOption.WECHAT -> R.drawable.ic_wechat
            PaymentOption.GOOGLE_PAY -> R.drawable.ic_google_pay
        }
    }
}