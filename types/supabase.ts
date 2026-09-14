export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: { id: string; user_id: string; provider: string; provider_account_id: string; name: string; currency: string; balance_current: number | null; balance_available: number | null; balance_overdraft: number | null; balance_updated_at: string | null; created_at: string };
        Insert: { id?: string; user_id: string; provider: string; provider_account_id: string; name: string; currency: string; balance_current?: number | null; balance_available?: number | null; balance_overdraft?: number | null; balance_updated_at?: string | null; created_at?: string };
        Update: { name?: string; currency?: string; balance_current?: number | null; balance_available?: number | null; balance_overdraft?: number | null; balance_updated_at?: string | null };
        Relationships: [];
      };
      user_profiles: {
        Row: { user_id: string; first_name: string | null; last_name: string | null; birth_date: string | null; gender: string | null; country: string | null; created_at: string; updated_at: string };
        Insert: { user_id: string; first_name?: string | null; last_name?: string | null; birth_date?: string | null; gender?: string | null; country?: string | null; created_at?: string; updated_at?: string };
        Update: { first_name?: string | null; last_name?: string | null; birth_date?: string | null; gender?: string | null; country?: string | null; updated_at?: string };
        Relationships: [];
      };
      transactions: {
        Row: { id: string; user_id: string; account_id: string; provider_transaction_id: string; merchant_name: string; description: string; amount: number; currency: string; transaction_date: string; category: string; subcategory: string; category_source: string | null; category_confidence: number | null; categorized_at: string | null; categorization_attempted_at: string | null; pending: boolean; raw_data: Json | null; amount_base: number | null; base_currency: string | null; fx_rate: number | null; fx_rate_date: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; account_id: string; provider_transaction_id: string; merchant_name?: string; description?: string; amount: number; currency: string; transaction_date: string; category?: string; subcategory?: string; category_source?: string | null; category_confidence?: number | null; categorized_at?: string | null; categorization_attempted_at?: string | null; pending?: boolean; raw_data?: Json | null; amount_base?: number | null; base_currency?: string | null; fx_rate?: number | null; fx_rate_date?: string | null; created_at?: string; updated_at?: string };
        Update: { merchant_name?: string; description?: string; amount?: number; currency?: string; transaction_date?: string; category?: string; subcategory?: string; category_source?: string | null; category_confidence?: number | null; categorized_at?: string | null; categorization_attempted_at?: string | null; pending?: boolean; raw_data?: Json | null; amount_base?: number | null; base_currency?: string | null; fx_rate?: number | null; fx_rate_date?: string | null; updated_at?: string };
        Relationships: [];
      };
      categories: {
        Row: { id: string; user_id: string; name: string; monthly_budget: number | null; created_at: string };
        Insert: { id?: string; user_id: string; name: string; monthly_budget?: number | null; created_at?: string };
        Update: { name?: string; monthly_budget?: number | null };
        Relationships: [];
      };
      merchant_rules: {
        Row: { id: string; user_id: string; merchant_pattern: string; normalized_merchant: string; category: string; subcategory: string; source: string; confidence: number | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; merchant_pattern: string; normalized_merchant: string; category: string; subcategory: string; source?: string; confidence?: number | null; created_at?: string; updated_at?: string };
        Update: { merchant_pattern?: string; normalized_merchant?: string; category?: string; subcategory?: string; source?: string; confidence?: number | null; updated_at?: string };
        Relationships: [];
      };
      subscriptions: {
        Row: { id: string; user_id: string; merchant_name: string; average_amount: number; latest_amount: number | null; previous_amount: number | null; currency: string; frequency: string; last_transaction_date: string; active: boolean; direction: string; created_at: string };
        Insert: { id?: string; user_id: string; merchant_name: string; average_amount: number; latest_amount?: number | null; previous_amount?: number | null; currency: string; frequency: string; last_transaction_date: string; active?: boolean; direction?: string; created_at?: string };
        Update: { merchant_name?: string; average_amount?: number; currency?: string; frequency?: string; last_transaction_date?: string; active?: boolean; direction?: string };
        Relationships: [];
      };
      budgets: {
        Row: { id: string; user_id: string; category: string; currency: string; monthly_limit: number; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; category: string; currency: string; monthly_limit: number; created_at?: string; updated_at?: string };
        Update: { category?: string; currency?: string; monthly_limit?: number; updated_at?: string };
        Relationships: [];
      };
      assistant_conversations: {
        Row: { id: string; user_id: string; title: string; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; title?: string; created_at?: string; updated_at?: string };
        Update: { title?: string; updated_at?: string };
        Relationships: [];
      };
      assistant_messages: {
        Row: { id: string; conversation_id: string; user_id: string; role: string; content: string; created_at: string };
        Insert: { id?: string; conversation_id: string; user_id: string; role: string; content: string; created_at?: string };
        Update: { content?: string };
        Relationships: [];
      };
      user_onboarding: {
        Row: { user_id: string; completed_at: string };
        Insert: { user_id: string; completed_at?: string };
        Update: { completed_at?: string };
        Relationships: [];
      };
      user_settings: {
        Row: { user_id: string; base_currency: string; created_at: string; updated_at: string };
        Insert: { user_id: string; base_currency: string; created_at?: string; updated_at?: string };
        Update: { base_currency?: string; updated_at?: string };
        Relationships: [];
      };
      fx_rates: {
        Row: { rate_date: string; base_currency: string; quote_currency: string; rate: number; source: string; fetched_at: string };
        Insert: { rate_date: string; base_currency: string; quote_currency: string; rate: number; source?: string; fetched_at?: string };
        Update: { rate?: number; source?: string; fetched_at?: string };
        Relationships: [];
      };
      account_balance_snapshots: {
        Row: { id: string; user_id: string; account_id: string; currency: string; balance_current: number; balance_available: number | null; balance_overdraft: number | null; captured_at: string; captured_on: string };
        Insert: { id?: string; user_id: string; account_id: string; currency: string; balance_current: number; balance_available?: number | null; balance_overdraft?: number | null; captured_at?: string };
        Update: { balance_current?: number; balance_available?: number | null; balance_overdraft?: number | null; captured_at?: string };
        Relationships: [];
      };
      system_events: {
        Row: { id: number; user_id: string | null; kind: string; severity: string; context: Record<string, unknown>; created_at: string };
        Insert: { id?: number; user_id?: string | null; kind: string; severity?: string; context?: Record<string, unknown>; created_at?: string };
        Update: { severity?: string; context?: Record<string, unknown> };
        Relationships: [];
      };
      usage_counters: {
        Row: { user_id: string; resource: string; window_start: string; used: number; updated_at: string };
        Insert: { user_id: string; resource: string; window_start?: string; used?: number; updated_at?: string };
        Update: { used?: number; updated_at?: string };
        Relationships: [];
      };
      bank_connections: {
        Row: { id: string; user_id: string; provider: string; provider_connection_id: string; display_name: string | null; status: string; environment: string; account_count: number; last_error: string | null; sync_cursor: string | null; sync_lock_id: string | null; sync_locked_until: string | null; last_synced_at: string | null; last_sync_duration_ms: number | null; authorized_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; provider: string; provider_connection_id: string; display_name?: string | null; status?: string; environment?: string; account_count?: number; last_error?: string | null; sync_cursor?: string | null; sync_lock_id?: string | null; sync_locked_until?: string | null; last_synced_at?: string | null; last_sync_duration_ms?: number | null; authorized_at?: string | null; created_at?: string; updated_at?: string };
        Update: { display_name?: string | null; status?: string; environment?: string; account_count?: number; last_error?: string | null; sync_cursor?: string | null; sync_lock_id?: string | null; sync_locked_until?: string | null; last_synced_at?: string | null; last_sync_duration_ms?: number | null; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      finance_monthly_summary: {
        Args: { p_month: string; p_currency?: string | null; p_account_id?: string | null; p_category?: string | null };
        Returns: Array<{ total_spent: number; previous_month_spent: number; change_percent: number | null; pending_spent: number }>;
      };
      finance_spending_by_category: {
        Args: { p_from: string; p_to: string; p_currency?: string | null; p_account_id?: string | null; p_category?: string | null };
        Returns: Array<{ category: string; total_spent: number }>;
      };
      finance_budget_status: {
        Args: { p_month: string; p_currency?: string | null };
        Returns: Array<{ budget_id: string | null; category: string; currency: string; monthly_limit: number | null; spent: number; remaining: number | null; percentage_used: number | null }>;
      };
      finance_top_merchants: {
        Args: { p_month: string; p_currency?: string | null; p_account_id?: string | null; p_category?: string | null; p_limit?: number };
        Returns: Array<{ merchant_name: string; total_spent: number }>;
      };
      finance_spending_between: {
        Args: { p_from: string; p_to: string; p_currency?: string | null; p_category?: string | null; p_account_id?: string | null };
        Returns: Array<{ total_spent: number }>;
      };
      finance_recent_transactions: {
        Args: { p_from: string; p_to: string; p_currency?: string | null; p_account_id?: string | null; p_category?: string | null; p_limit?: number };
        Returns: Array<{ id: string; account_id: string; provider_transaction_id: string; merchant_name: string; description: string; amount: number; currency: string; amount_base: number | null; base_currency: string; transaction_date: string; category: string; subcategory: string; pending: boolean }>;
      };
      finance_base_currency: { Args: Record<string, never>; Returns: string };
      finance_monthly_trend: { Args: { p_months?: number }; Returns: Array<{ month: string; total_spent: number }> };
      finance_category_history: { Args: { p_months?: number }; Returns: Array<{ category: string; average_monthly: number; months_counted: number }> };
      finance_all_time_totals: { Args: Record<string, never>; Returns: Array<{ category: string; spent: number; received: number; transactions: number; first_at: string | null; last_at: string | null; unconverted: number }> };
      finance_month_to_date: { Args: { p_month: string; p_day: number; p_months?: number }; Returns: Array<{ month: string; total: number }> };
      finance_month_flows: { Args: { p_month: string; p_currency: string | null; p_account_id?: string | null; p_self_names?: string[] }; Returns: Array<{ income: number; outflow: number; transfers_excluded: number }> };
      finance_discretionary_by_day: { Args: { p_months?: number; p_currency?: string | null; p_exclude?: string[] }; Returns: Array<{ month: string; day: number; total: number }> };
      consume_quota: { Args: { p_resource: string; p_limit: number }; Returns: Array<{ allowed: boolean; used: number; quota: number }> };
      finance_balance_history: {
        Args: { p_from: string; p_to: string; p_currency: string; p_account_id?: string | null };
        Returns: Array<{ day: string; balance: number; reconstructed: boolean }>;
      };
      bank_create_oauth_state: { Args: { p_state_hash: string; p_user_id: string; p_expires_at: string }; Returns: undefined };
      bank_consume_oauth_state: { Args: { p_state_hash: string; p_user_id: string }; Returns: boolean };
      bank_save_connection_secret: { Args: { p_connection_id: string; p_access_token_ciphertext: string; p_refresh_token_ciphertext: string | null; p_access_token_expires_at: string }; Returns: undefined };
      bank_get_connection_secret: { Args: { p_connection_id: string }; Returns: Array<{ access_token_ciphertext: string; refresh_token_ciphertext: string | null; access_token_expires_at: string }> };
      finance_available_currencies: { Args: Record<string, never>; Returns: Array<{ currency: string; transaction_count: number; last_activity: string | null }> };
      bank_try_sync_lock: { Args: { p_connection_id: string; p_lock_id: string; p_ttl_seconds?: number }; Returns: boolean };
      bank_release_sync_lock: { Args: { p_connection_id: string; p_lock_id: string; p_success: boolean; p_account_count: number; p_duration_ms: number; p_error?: string | null }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
