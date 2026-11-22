import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Clock, X, RotateCw } from 'lucide-react';

export function extractRetryDelayFromError(err: any): number {
  if (err?.retryDelaySeconds && typeof err.retryDelaySeconds === 'number' && err.retryDelaySeconds > 0) {
    return Math.ceil(err.retryDelaySeconds);
  }
  const raw = String(err?.message || err?.error || err || '');
  const match = raw.match(/retry(?:Delay|_delay|(?:\s+after|\s+in))[:\s"]+(\d+(?:\.\d+)?)\s*s?/i);
  if (match && match[1]) {
    const val = parseFloat(match[1]);
    if (val > 0) return Math.ceil(val);
  }
  return 30; // default fallback
}

export function isQuotaError(err: any): boolean {
  if (err?.isQuotaError) return true;
  const raw = String(err?.message || err?.error || err || '').toLowerCase();
  return (
    raw.includes('429') ||
    raw.includes('resource_exhausted') ||
    raw.includes('quota') ||
    raw.includes('rate limit') ||
    raw.includes('limit: 0')
  );
}

interface FriendlyErrorBoxProps {
  error: any;
  cooldownSeconds?: number;
  onRetry?: () => void;
  onDismiss?: () => void;
  language?: 'urdu' | 'hindi' | 'english';
  className?: string;
}

export const FriendlyErrorBox: React.FC<FriendlyErrorBoxProps> = ({
  error,
  cooldownSeconds,
  onRetry,
  onDismiss,
  language = 'urdu',
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!error) return null;

  const raw = typeof error === 'string' ? error : error?.message || error?.error || JSON.stringify(error);
  const isQuota = isQuotaError(error);

  const seconds = cooldownSeconds && cooldownSeconds > 0
    ? cooldownSeconds
    : extractRetryDelayFromError(error);

  const boxClasses = isQuota
    ? 'bg-amber-950/40 border-amber-800/60 text-amber-200 shadow-amber-950/20'
    : 'bg-red-950/50 border-red-800/60 text-slate-200 shadow-red-950/20';

  const iconClasses = isQuota
    ? 'bg-amber-900/40 text-amber-400'
    : 'bg-red-900/40 text-red-400';

  return (
    <div
      id="friendly-error-box"
      className={`rounded-xl border p-3 text-slate-200 space-y-2 shadow-md ${boxClasses} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`p-1 rounded-lg shrink-0 mt-0.5 ${iconClasses}`}>
            {isQuota ? <Clock className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          </div>
          <div className="space-y-1 min-w-0">
            {isQuota ? (
              <>
                {language === 'hindi' ? (
                  <p className="text-xs font-bold text-amber-300 leading-relaxed">
                    कोटा कूलडाउन सक्रिय है, कृपया {seconds} सेकंड प्रतीक्षा करें।
                  </p>
                ) : (
                  <p className="text-xs font-bold text-amber-300 font-urdu leading-relaxed">
                    کوٹہ کول ڈاؤن فعال ہے، برائے مہربانی {seconds} سیکنڈ بعد کوشش کریں۔
                  </p>
                )}
                <p className="text-xs text-amber-200/90 flex items-center gap-1.5 font-mono">
                  <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Quota rate limit cooldown. Retry available in {seconds}s.</span>
                </p>
              </>
            ) : (
              <>
                {language === 'hindi' ? (
                  <p className="text-xs font-bold text-red-300 leading-relaxed">
                    अनुरोध पूरा नहीं हो सका।
                  </p>
                ) : (
                  <p className="text-xs font-bold text-red-300 font-urdu leading-relaxed">
                    درخواست پر عمل درآمد نہیں ہو سکا۔
                  </p>
                )}
                <p className="text-xs text-red-200">
                  Request could not be completed.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Action buttons: Details Toggle & Dismiss */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[11px] text-amber-300 hover:text-white flex items-center gap-1 bg-amber-950/60 hover:bg-amber-900/80 px-2 py-1 rounded-lg border border-amber-700/60 transition-colors cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}

          {/* Details Toggle Button */}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 bg-slate-900/90 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700/80 transition-colors cursor-pointer font-medium"
            title="Toggle raw technical error details"
          >
            <span>{showDetails ? 'Hide' : 'Details'}</span>
            <span className="text-[10px] opacity-75 font-urdu">
              ({showDetails ? 'چھپائیں' : 'تفصیلات'})
            </span>
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Raw Error Details (Collapsible) */}
      {showDetails && (
        <div className="pt-2 border-t border-red-900/50">
          <p className="text-[10px] text-slate-400 font-urdu mb-1">تکنیکی تفصیلات (Raw Technical Details):</p>
          <pre className="text-[10px] font-mono text-red-200/90 bg-slate-950 p-2.5 rounded-lg overflow-x-auto max-h-36 whitespace-pre-wrap break-all border border-slate-800">
            {raw}
          </pre>
        </div>
      )}
    </div>
  );
};
