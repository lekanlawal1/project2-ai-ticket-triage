"""The seven support teams, and which of Banking77's 77 request types each one handles.

Banking77 (PolyAI, CC BY 4.0) labels each customer message with one of 77 request types. A support
desk doesn't have 77 queues, so they're grouped into the seven teams a bank's support desk would
plausibly have. The grouping is mine, written before any model was run, and it's the ground truth
everything is scored against.

Priority follows the request type too: anything that looks like fraud or a lost card is urgent,
money that's missing or charged wrongly is high, the rest is normal.
"""

TEAMS = {
    "cards": "Cards",
    "transfers": "Transfers",
    "top_ups": "Top-ups",
    "cash": "Cash and ATMs",
    "fees_fx": "Fees and exchange",
    "account": "Account and identity",
    "fraud": "Fraud and security",
}

INTENTS = {
    "cards": [
        "activate_my_card", "apple_pay_or_google_pay", "card_about_to_expire", "card_acceptance", "card_arrival",
        "card_delivery_estimate", "card_linking", "card_not_working", "change_pin", "contactless_not_working",
        "declined_card_payment", "disposable_card_limits", "get_disposable_virtual_card", "get_physical_card",
        "getting_spare_card", "getting_virtual_card", "order_physical_card", "pending_card_payment", "pin_blocked",
        "reverted_card_payment?", "virtual_card_not_working", "visa_or_mastercard", "supported_cards_and_currencies",
        "Refund_not_showing_up", "request_refund", "transaction_charged_twice",
    ],
    "transfers": [
        "beneficiary_not_allowed", "cancel_transfer", "declined_transfer", "failed_transfer", "pending_transfer",
        "receiving_money", "transfer_into_account", "transfer_not_received_by_recipient", "transfer_timing",
        "balance_not_updated_after_bank_transfer",
    ],
    "top_ups": [
        "automatic_top_up", "pending_top_up", "top_up_by_cash_or_cheque", "top_up_failed", "top_up_limits",
        "top_up_reverted", "topping_up_by_card", "verify_top_up", "balance_not_updated_after_cheque_or_cash_deposit",
    ],
    "cash": [
        "atm_support", "card_swallowed", "declined_cash_withdrawal", "pending_cash_withdrawal",
        "wrong_amount_of_cash_received",
    ],
    "fees_fx": [
        "card_payment_fee_charged", "card_payment_wrong_exchange_rate", "cash_withdrawal_charge", "exchange_charge",
        "exchange_rate", "exchange_via_app", "extra_charge_on_statement", "fiat_currency_support",
        "top_up_by_bank_transfer_charge", "top_up_by_card_charge", "transfer_fee_charged",
        "wrong_exchange_rate_for_cash_withdrawal",
    ],
    "account": [
        "age_limit", "country_support", "edit_personal_details", "passcode_forgotten", "terminate_account",
        "unable_to_verify_identity", "verify_my_identity", "verify_source_of_funds", "why_verify_identity",
    ],
    "fraud": [
        "card_payment_not_recognised", "cash_withdrawal_not_recognised", "compromised_card",
        "direct_debit_payment_not_recognised", "lost_or_stolen_card", "lost_or_stolen_phone",
    ],
}

URGENT = set(INTENTS["fraud"])
HIGH = {
    "transfer_not_received_by_recipient", "balance_not_updated_after_bank_transfer",
    "balance_not_updated_after_cheque_or_cash_deposit", "wrong_amount_of_cash_received", "transaction_charged_twice",
    "card_swallowed", "pin_blocked", "Refund_not_showing_up", "failed_transfer", "top_up_failed", "top_up_reverted",
    "extra_charge_on_statement",
}

TEAM_OF = {intent: team for team, intents in INTENTS.items() for intent in intents}


def priority_of(intent: str) -> str:
    return "urgent" if intent in URGENT else "high" if intent in HIGH else "normal"
