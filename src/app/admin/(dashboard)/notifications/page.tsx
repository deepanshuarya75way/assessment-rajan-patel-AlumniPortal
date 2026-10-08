'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import toast, { Toaster } from 'react-hot-toast';
import {
  Bell,
  Send,
  Users,
  Smartphone,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Lock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
  XCircle,
} from 'lucide-react';

interface CampaignItem {
  id: string;
  campaignGroupId?: string | null;
  type: string;
  title: string;
  body: string;
  url?: string | null;
  filter: Record<string, unknown>;
  pushStatus:
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'SCHEDULED'
    | 'CANCELLED';
  totalTargets: number | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  scheduledFor?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
}

type DeliveryTiming = 'IMMEDIATE' | 'SCHEDULED';

export default function NotificationsPage() {
  // ---------------------------------------------------------------------------
  // Current user / role
  // ---------------------------------------------------------------------------

  const [userRole, setUserRole] = useState<string | null>(null);

  const [assignedCampus, setAssignedCampus] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [campuses, setCampuses] = useState<
    { id: string; name: string }[]
  >([]);

  // ---------------------------------------------------------------------------
  // Audience filters
  // ---------------------------------------------------------------------------

  const [campusFilter, setCampusFilter] = useState('all');
  const [batchYear, setBatchYear] = useState('');
  const [branch, setBranch] = useState('');
  const [course, setCourse] = useState('');
  const [inviteStatus, setInviteStatus] = useState('REGISTERED');

  // ---------------------------------------------------------------------------
  // Audience count
  // ---------------------------------------------------------------------------

  const [countLoading, setCountLoading] = useState(false);

  const [audienceCount, setAudienceCount] = useState<{
    totalAlumni: number;
    subscribedDevices: number;
  }>({
    totalAlumni: 0,
    subscribedDevices: 0,
  });

  // ---------------------------------------------------------------------------
  // Compose form
  // ---------------------------------------------------------------------------

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/alumni/feed');
  const [type, setType] = useState('ADMIN_ANNOUNCEMENT');
  const [channel, setChannel] = useState('PUSH_AND_INAPP');

  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------------

  const [deliveryTiming, setDeliveryTiming] =
    useState<DeliveryTiming>('IMMEDIATE');

  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);

    return d.toISOString().split('T')[0];
  });

  const [scheduledTime, setScheduledTime] = useState('09:00');

  const minDate = new Date().toISOString().split('T')[0];

  // ---------------------------------------------------------------------------
  // Confirmation / cancellation state
  // ---------------------------------------------------------------------------

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [campaignToCancel, setCampaignToCancel] =
    useState<CampaignItem | null>(null);

  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // ---------------------------------------------------------------------------
  // Academic options
  // ---------------------------------------------------------------------------

  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [courseOptions, setCourseOptions] = useState<string[]>([]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const getTargetScheduledDate = useCallback(() => {
    if (deliveryTiming !== 'SCHEDULED') {
      return null;
    }

    if (!scheduledDate || !scheduledTime) {
      return null;
    }

    const d = new Date(`${scheduledDate}T${scheduledTime}`);

    return Number.isNaN(d.getTime()) ? null : d;
  }, [deliveryTiming, scheduledDate, scheduledTime]);

  const getEffectiveCampusId = useCallback(() => {
    if (userRole === 'ADMIN') {
      return campusFilter === 'all' ? null : campusFilter;
    }

    return assignedCampus?.id ?? null;
  }, [userRole, campusFilter, assignedCampus]);

  // ---------------------------------------------------------------------------
  // Initial data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const meRes = await apiFetch('/admin/me');

        if (meRes.ok) {
          const data = await meRes.json();

          const role = data.user?.role ?? null;

          setUserRole(role);

          if (data.user?.campus) {
            setAssignedCampus(data.user.campus);

            if (role !== 'ADMIN') {
              setCampusFilter(data.user.campus.id);
            }
          }
        }
      } catch {
        // Intentionally ignore profile failure.
      }

      try {
        const campusRes = await apiFetch('/admin/campuses');

        if (campusRes.ok) {
          const data = await campusRes.json();

          setCampuses(Array.isArray(data) ? data : []);
        }
      } catch {
        // Intentionally ignore campus loading failure.
      }

      try {
        const optionsRes = await apiFetch('/admin/academic-options');

        if (optionsRes.ok) {
          const data = await optionsRes.json();

          if (Array.isArray(data.options)) {
            const branches = data.options
              .filter((o: any) => o.type === 'BRANCH')
              .map((o: any) => o.value);

            const courses = data.options
              .filter((o: any) => o.type === 'COURSE')
              .map((o: any) => o.value);

            setBranchOptions(branches);
            setCourseOptions(courses);
          }
        }
      } catch {
        // Intentionally ignore academic options failure.
      }
    };

    loadInitialData();
  }, []);

  // ---------------------------------------------------------------------------
  // Audience count
  // ---------------------------------------------------------------------------

  const calculateAudience = useCallback(async () => {
    setCountLoading(true);

    try {
      const res = await apiFetch(
        '/admin/notifications/campaigns/count',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filter: {
              campusId: getEffectiveCampusId(),
              batchYear: batchYear || null,
              branch: branch || null,
              course: course || null,
              inviteStatus,
            },
          }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to calculate audience');
      }

      const data = await res.json();

      setAudienceCount({
        totalAlumni: Number(data.totalAlumni || 0),
        subscribedDevices: Number(data.subscribedDevices || 0),
      });
    } catch (err) {
      console.error('Error fetching audience count:', err);
    } finally {
      setCountLoading(false);
    }
  }, [
    getEffectiveCampusId,
    batchYear,
    branch,
    course,
    inviteStatus,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      calculateAudience();
    }, 350);

    return () => clearTimeout(timer);
  }, [calculateAudience]);

  // ---------------------------------------------------------------------------
  // Campaign history
  // ---------------------------------------------------------------------------

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/admin/notifications/campaigns?page=${page}&limit=10`
      );

      if (!res.ok) {
        throw new Error('Failed to fetch campaign history');
      }

      const data = await res.json();

      setCampaigns(Array.isArray(data.data) ? data.data : []);
      setTotalPages(Math.max(1, data.pagination?.pages || 1));
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [page]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // ---------------------------------------------------------------------------
  // Auto-refresh active campaigns
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const hasActiveCampaigns = campaigns.some(
      (c) =>
        c.pushStatus === 'PENDING' ||
        c.pushStatus === 'PROCESSING' ||
        c.pushStatus === 'SCHEDULED'
    );

    if (!hasActiveCampaigns) {
      return;
    }

    const interval = setInterval(() => {
      fetchCampaigns();
    }, 4000);

    return () => clearInterval(interval);
  }, [campaigns, fetchCampaigns]);

  // ---------------------------------------------------------------------------
  // Open send confirmation
  // ---------------------------------------------------------------------------

  const openSendConfirmation = () => {
    if (!title.trim()) {
      toast.error('Please enter a notification title.');
      return;
    }

    if (!body.trim()) {
      toast.error('Please enter the notification body.');
      return;
    }

    if (audienceCount.totalAlumni === 0) {
      toast.error('The selected filter matches 0 alumni.');
      return;
    }

    if (deliveryTiming === 'SCHEDULED') {
      const scheduledTarget = getTargetScheduledDate();

      if (!scheduledTarget) {
        toast.error('Please select a valid scheduled date and time.');
        return;
      }

      if (scheduledTarget.getTime() <= Date.now() + 30_000) {
        toast.error(
          'Scheduled broadcast must be at least 30 seconds in the future.'
        );
        return;
      }
    }

    setShowConfirmModal(true);
  };

  // ---------------------------------------------------------------------------
  // Submit campaign
  // ---------------------------------------------------------------------------

  const handleSendCampaign = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Please enter both title and body.');
      return;
    }

    if (audienceCount.totalAlumni === 0) {
      toast.error('The selected filter matches 0 alumni.');
      return;
    }

    let scheduledForIso: string | null = null;

    if (deliveryTiming === 'SCHEDULED') {
      const scheduledTarget = getTargetScheduledDate();

      if (!scheduledTarget) {
        toast.error('Please select a valid schedule date and time.');
        return;
      }

      if (scheduledTarget.getTime() <= Date.now() + 30_000) {
        toast.error(
          'Scheduled broadcast must be at least 30 seconds in the future.'
        );
        return;
      }

      scheduledForIso = scheduledTarget.toISOString();
    }

    setSubmitting(true);

    try {
      const res = await apiFetch(
        '/admin/notifications/campaigns',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim(),
            url: url.trim() || null,
            type,
            channel,
            scheduledFor: scheduledForIso,
            filter: {
              campusId: getEffectiveCampusId(),
              batchYear: batchYear || null,
              branch: branch || null,
              course: course || null,
              inviteStatus,
            },
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));

        throw new Error(
          errData.error || 'Failed to submit campaign'
        );
      }

      if (deliveryTiming === 'SCHEDULED' && scheduledForIso) {
        const formattedDate = new Date(
          scheduledForIso
        ).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        toast.success(
          `Campaign scheduled for ${formattedDate}.`
        );
      } else {
        toast.success(
          'Campaign queued! Background worker will process delivery.'
        );
      }

      setTitle('');
      setBody('');
      setDeliveryTiming('IMMEDIATE');

      setShowConfirmModal(false);

      await fetchCampaigns();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error submitting campaign';

      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Cancel campaign
  //
  // Expected backend endpoint:
  //
  // PATCH /admin/notifications/campaigns/:id/cancel
  //
  // If your backend uses DELETE or POST instead, change only this request.
  // ---------------------------------------------------------------------------

  const handleCancelCampaign = async (campaign: CampaignItem) => {
    if (
      campaign.pushStatus !== 'PENDING' &&
      campaign.pushStatus !== 'PROCESSING' &&
      campaign.pushStatus !== 'SCHEDULED'
    ) {
      toast.error('This campaign can no longer be cancelled.');
      return;
    }

    setCancellingId(campaign.id);

    try {
      const res = await apiFetch(
        `/admin/notifications/campaigns/${campaign.id}/cancel`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));

        throw new Error(
          errData.error || 'Failed to cancel campaign'
        );
      }

      toast.success('Campaign cancelled successfully.');

      setCampaignToCancel(null);

      await fetchCampaigns();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to cancel campaign';

      toast.error(msg);
    } finally {
      setCancellingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Status badge
  // ---------------------------------------------------------------------------

  const renderStatusBadge = (status: CampaignItem['pushStatus']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
            <Clock size={11} />
            PENDING
          </span>
        );

      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800">
            <RefreshCw
              size={11}
              className="animate-spin"
            />
            PROCESSING
          </span>
        );

      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800">
            <Clock size={11} />
            SCHEDULED
          </span>
        );

      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
            <CheckCircle2 size={11} />
            COMPLETED
          </span>
        );

      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">
            <AlertCircle size={11} />
            FAILED
          </span>
        );

      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-700">
            <XCircle size={11} />
            CANCELLED
          </span>
        );

      default:
        return null;
    }
  };

  const canCancelCampaign = (campaign: CampaignItem) =>
    campaign.pushStatus === 'PENDING' ||
    campaign.pushStatus === 'PROCESSING' ||
    campaign.pushStatus === 'SCHEDULED';

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      <Toaster position="top-right" />

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-[#003D7A]/10 text-[#003D7A]">
              <Bell className="w-6 h-6" />
            </span>

            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Push Notification Campaigns
            </h1>
          </div>

          <p className="text-sm text-slate-500 mt-1">
            Compose and broadcast targeted OS-level push notifications
            to alumni devices via background batch worker.
          </p>
        </div>

        <button
          onClick={() => {
            fetchCampaigns();
            calculateAudience();
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition self-start md:self-auto"
        >
          <RefreshCw
            size={14}
            className={loadingHistory ? 'animate-spin' : ''}
          />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* ---------------------------------------------------------------- */}
        {/* LEFT                                                             */}
        {/* ---------------------------------------------------------------- */}

        <div className="lg:col-span-7 space-y-6">
          {/* Audience Filter */}

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#003D7A]" />

                <h2 className="text-base font-bold text-slate-800">
                  1. Target Audience Filter
                </h2>
              </div>

              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-xs font-bold text-blue-800">
                {countLoading ? (
                  <RefreshCw
                    size={12}
                    className="animate-spin text-blue-600"
                  />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}

                <span>
                  {countLoading
                    ? 'Calculating...'
                    : `${audienceCount.totalAlumni.toLocaleString()} Alumni`}
                </span>

                <span className="text-blue-400 font-normal">
                  |
                </span>

                <span className="text-blue-700 font-semibold flex items-center gap-1">
                  <Smartphone size={11} />

                  {audienceCount.subscribedDevices.toLocaleString()}{' '}
                  Devices
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Campus */}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Campus Scope</span>

                  {userRole !== 'ADMIN' && (
                    <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                      <Lock size={10} />
                      Locked to your campus
                    </span>
                  )}
                </label>

                {userRole === 'ADMIN' ? (
                  <select
                    value={campusFilter}
                    onChange={(e) =>
                      setCampusFilter(e.target.value)
                    }
                    className="w-full text-xs font-bold text-slate-900 px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                  >
                    <option value="all">
                      🌐 All Campuses (University-wide)
                    </option>

                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        🏛️ {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-900">
                    <Lock
                      size={13}
                      className="text-slate-500"
                    />

                    <span className="truncate">
                      {assignedCampus?.name ||
                        'Assigned Campus'}
                    </span>
                  </div>
                )}
              </div>

              {/* Batch Year */}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Batch / Passout Year
                </label>

                <input
                  type="text"
                  placeholder="e.g. 2024 or 2021-28 and blank for all"
                  value={batchYear}
                  onChange={(e) =>
                    setBatchYear(e.target.value)
                  }
                  className="w-full text-xs font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                />
              </div>

              {/* Branch */}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Branch / Department
                </label>

                {branchOptions.length > 0 ? (
                  <select
                    value={branch}
                    onChange={(e) =>
                      setBranch(e.target.value)
                    }
                    className="w-full text-xs font-bold text-slate-900 px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                  >
                    <option value="">
                      All Branches
                    </option>

                    {branchOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. CSE, Mechanical"
                    value={branch}
                    onChange={(e) =>
                      setBranch(e.target.value)
                    }
                    className="w-full text-xs font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                  />
                )}
              </div>

              {/* Course */}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Degree / Course
                </label>

                {courseOptions.length > 0 ? (
                  <select
                    value={course}
                    onChange={(e) =>
                      setCourse(e.target.value)
                    }
                    className="w-full text-xs font-bold text-slate-900 px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                  >
                    <option value="">
                      All Courses
                    </option>

                    {courseOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. B.Tech, MBA, MCA"
                    value={course}
                    onChange={(e) =>
                      setCourse(e.target.value)
                    }
                    className="w-full text-xs font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                  />
                )}
              </div>

              {/* Registration Status */}

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Alumni Registration Status
                </label>

                <select
                  value={inviteStatus}
                  onChange={(e) =>
                    setInviteStatus(e.target.value)
                  }
                  className="w-full text-xs font-bold text-slate-900 px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                >
                  <option value="REGISTERED">
                    🟢 Registered Users Only (Recommended)
                  </option>

                  <option value="">
                    🌐 All Alumni (Active + Future Registrants)
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Compose */}

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Send className="w-5 h-5 text-[#C41E3A]" />

              <h2 className="text-base font-bold text-slate-800">
                2. Compose Notification Message
              </h2>
            </div>

            <div className="space-y-4">
              {/* Title */}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Notification Title
                </label>

                <input
                  type="text"
                  placeholder="e.g. Annual Alumni Meet 2026 Registration Open"
                  value={title}
                  onChange={(e) =>
                    setTitle(e.target.value)
                  }
                  maxLength={120}
                  className="w-full text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                />
              </div>

              {/* Body */}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Message Body
                </label>

                <textarea
                  placeholder="Enter the push message text..."
                  value={body}
                  onChange={(e) =>
                    setBody(e.target.value)
                  }
                  rows={4}
                  maxLength={500}
                  className="w-full text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm leading-relaxed"
                />

                <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1">
                  <span>
                    Keep body under 200 characters for optimal
                    mobile OS display.
                  </span>

                  <span>{body.length} / 500</span>
                </div>
              </div>

              {/* URL / Type / Channel */}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Target Landing URL (Relative)
                  </label>

                  <input
                    type="text"
                    placeholder="/alumni/events or /alumni/feed"
                    value={url}
                    onChange={(e) =>
                      setUrl(e.target.value)
                    }
                    className="w-full text-xs font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Notification Type
                  </label>

                  <select
                    value={type}
                    onChange={(e) =>
                      setType(e.target.value)
                    }
                    className="w-full text-xs font-bold text-slate-900 px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                  >
                    <option value="ADMIN_ANNOUNCEMENT">
                      Admin Announcement
                    </option>

                    <option value="ANALYTICS_MILESTONE">
                      Milestone / Achievement
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Delivery Channel
                  </label>

                  <select
                    value={channel}
                    onChange={(e) =>
                      setChannel(e.target.value)
                    }
                    className="w-full text-xs font-bold text-slate-900 px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none transition shadow-sm"
                  >
                    <option value="PUSH_AND_INAPP">
                      In-App + Web Push
                    </option>

                    <option value="INAPP_ONLY">
                      In-App Only (Quiet)
                    </option>
                  </select>
                </div>
              </div>

              {/* Delivery timing */}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800">
                      Delivery Timing
                    </h3>

                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Choose whether the worker should deliver
                      immediately or at a specific time.
                    </p>
                  </div>

                  <Clock
                    size={16}
                    className="text-[#003D7A]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDeliveryTiming('IMMEDIATE')
                    }
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition ${
                      deliveryTiming === 'IMMEDIATE'
                        ? 'bg-[#003D7A] text-white border-[#003D7A]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Send Immediately
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDeliveryTiming('SCHEDULED')
                    }
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition ${
                      deliveryTiming === 'SCHEDULED'
                        ? 'bg-[#003D7A] text-white border-[#003D7A]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Schedule Broadcast
                  </button>
                </div>

                {deliveryTiming === 'SCHEDULED' && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Date
                      </label>

                      <input
                        type="date"
                        min={minDate}
                        value={scheduledDate}
                        onChange={(e) =>
                          setScheduledDate(e.target.value)
                        }
                        className="w-full text-xs font-bold text-slate-900 px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Time
                      </label>

                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) =>
                          setScheduledTime(e.target.value)
                        }
                        className="w-full text-xs font-bold text-slate-900 px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#003D7A] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Queue button */}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={openSendConfirmation}
                  disabled={
                    !title.trim() ||
                    !body.trim() ||
                    audienceCount.totalAlumni === 0 ||
                    submitting
                  }
                  className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#003D7A] to-[#C41E3A] hover:opacity-95 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />

                  <span>
                    {deliveryTiming === 'SCHEDULED'
                      ? `Schedule Broadcast for ${audienceCount.totalAlumni.toLocaleString()} Alumni`
                      : `Queue Broadcast to ${audienceCount.totalAlumni.toLocaleString()} Alumni`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT                                                            */}
        {/* ---------------------------------------------------------------- */}

        <div className="lg:col-span-5 space-y-6">
          {/* Preview */}

          <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1 text-slate-300">
                <Sparkles
                  size={13}
                  className="text-amber-400"
                />
                OS Notification Preview
              </span>

              <span>Now</span>
            </div>

            <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700/80 flex items-start gap-3.5 shadow-inner">
              <div className="w-10 h-10 rounded-xl bg-[#003D7A] text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-md">
                PTU
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    IKGPTU Alumni
                  </span>

                  <span className="text-[10px] text-slate-500">
                    just now
                  </span>
                </div>

                <h4 className="text-sm font-extrabold text-white mt-0.5 truncate">
                  {title || 'Announcement Title'}
                </h4>

                <p className="text-xs text-slate-300 mt-1 leading-relaxed line-clamp-3">
                  {body ||
                    'Your broadcast message body will be displayed here on user devices.'}
                </p>

                {url && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 mt-2 font-semibold">
                    <ExternalLink size={10} />
                    Link: {url}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick info */}

          <div className="bg-blue-50/60 rounded-3xl p-5 border border-blue-100 text-xs text-blue-900 space-y-2">
            <h4 className="font-bold flex items-center gap-1.5 text-blue-950">
              <Layers
                size={14}
                className="text-blue-600"
              />
              Asynchronous Campaign Delivery
            </h4>

            <p className="text-blue-800/80 leading-relaxed">
              When you submit a campaign, it enters the MySQL queue
              as <span className="font-bold">PENDING</span>. The
              background Windows Service worker picks it up and
              delivers messages in bounded 500-user batches with
              resumable cursors.
            </p>

            <p className="text-blue-800/80 leading-relaxed">
              Scheduled campaigns remain in{' '}
              <span className="font-bold">SCHEDULED</span> until
              their delivery time is reached.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* HISTORY                                                            */}
      {/* ------------------------------------------------------------------ */}

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#003D7A]" />

            <h2 className="text-lg font-bold text-slate-900">
              Campaign History & Progress
            </h2>
          </div>

          <span className="text-xs text-slate-500 font-medium">
            Auto-refreshes active campaigns
          </span>
        </div>

        {loadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-[#003D7A]" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No notification campaigns submitted yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 px-3">
                    Title & Message
                  </th>

                  <th className="pb-3 px-3">
                    Status
                  </th>

                  <th className="pb-3 px-3">
                    Audience
                  </th>

                  <th className="pb-3 px-3">
                    Progress
                  </th>

                  <th className="pb-3 px-3">
                    Created By
                  </th>

                  <th className="pb-3 px-3">
                    Date
                  </th>

                  <th className="pb-3 px-3 text-right">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => {
                  const total = c.totalTargets || 0;

                  const processed =
                    c.sentCount + c.failedCount;

                  const percent =
                    total > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (processed / total) * 100
                          )
                        )
                      : c.pushStatus === 'COMPLETED'
                        ? 100
                        : 0;

                  const isCancelling =
                    cancellingId === c.id;

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 transition"
                    >
                      {/* Title */}

                      <td className="py-3.5 px-3 max-w-xs">
                        <div className="font-bold text-slate-900 truncate">
                          {c.title}
                        </div>

                        <div className="text-slate-500 text-[11px] truncate mt-0.5">
                          {c.body}
                        </div>

                        {c.url && (
                          <div className="text-[10px] text-blue-600 truncate mt-0.5">
                            {c.url}
                          </div>
                        )}

                        {c.scheduledFor && (
                          <div className="text-[10px] text-purple-600 font-semibold mt-1">
                            Scheduled:{' '}
                            {new Date(
                              c.scheduledFor
                            ).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </td>

                      {/* Status */}

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {renderStatusBadge(
                          c.pushStatus
                        )}
                      </td>

                      {/* Audience */}

                      <td className="py-3.5 px-3 whitespace-nowrap font-bold text-slate-700">
                        {total.toLocaleString()} targets
                      </td>

                      {/* Progress */}

                      <td className="py-3.5 px-3 min-w-[140px]">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-1">
                          <span>
                            {c.sentCount.toLocaleString()}{' '}
                            sent
                          </span>

                          <span>{percent}%</span>
                        </div>

                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              c.pushStatus ===
                              'COMPLETED'
                                ? 'bg-emerald-500'
                                : c.pushStatus ===
                                    'PROCESSING'
                                  ? 'bg-blue-600'
                                  : c.pushStatus ===
                                      'CANCELLED'
                                    ? 'bg-slate-400'
                                    : c.pushStatus ===
                                        'FAILED'
                                      ? 'bg-rose-500'
                                      : c.pushStatus ===
                                          'SCHEDULED'
                                        ? 'bg-purple-500'
                                        : 'bg-amber-400'
                            }`}
                            style={{
                              width: `${percent}%`,
                            }}
                          />
                        </div>

                        {c.failedCount > 0 && (
                          <span className="text-[10px] text-rose-600 font-semibold mt-0.5 block">
                            {c.failedCount.toLocaleString()}{' '}
                            failed / expired
                          </span>
                        )}
                      </td>

                      {/* Created By */}

                      <td className="py-3.5 px-3 whitespace-nowrap text-slate-600 font-medium">
                        {c.createdBy?.name || 'Staff'}
                      </td>

                      {/* Date */}

                      <td className="py-3.5 px-3 whitespace-nowrap text-slate-500 text-[11px]">
                        {new Date(
                          c.createdAt
                        ).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Cancel */}

                      <td className="py-3.5 px-3 whitespace-nowrap text-right">
                        {canCancelCampaign(c) ? (
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() =>
                              setCampaignToCancel(c)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-[10px] transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isCancelling ? (
                              <RefreshCw
                                size={12}
                                className="animate-spin"
                              />
                            ) : (
                              <XCircle size={12} />
                            )}

                            {isCancelling
                              ? 'Cancelling...'
                              : 'Cancel'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-semibold">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">
              Page {page} of {totalPages}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setPage((p) => Math.max(1, p - 1))
                }
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronLeft size={16} />
              </button>

              <button
                onClick={() =>
                  setPage((p) =>
                    Math.min(totalPages, p + 1)
                  )
                }
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SEND CONFIRMATION MODAL                                            */}
      {/* ------------------------------------------------------------------ */}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle size={24} />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900">
                {deliveryTiming === 'SCHEDULED'
                  ? 'Confirm Scheduled Broadcast'
                  : 'Confirm Push Broadcast'}
              </h3>

              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                You are about to{' '}
                {deliveryTiming === 'SCHEDULED'
                  ? 'schedule'
                  : 'queue'}{' '}
                a notification to{' '}
                <span className="font-extrabold text-slate-800">
                  ~
                  {audienceCount.totalAlumni.toLocaleString()}{' '}
                  alumni
                </span>
                .
              </p>

              {deliveryTiming === 'SCHEDULED' && (
                <div className="mt-2 text-xs font-bold text-purple-700">
                  Scheduled for{' '}
                  {getTargetScheduledDate()
                    ? getTargetScheduledDate()!.toLocaleString(
                        undefined,
                        {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }
                      )
                    : 'Invalid date'}
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs space-y-1">
              <div className="font-bold text-slate-800 truncate">
                Title: {title}
              </div>

              <div className="text-slate-600 line-clamp-2">
                Body: {body}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() =>
                  setShowConfirmModal(false)
                }
                disabled={submitting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSendCampaign}
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#003D7A] to-[#C41E3A] rounded-xl shadow transition disabled:opacity-50"
              >
                {submitting
                  ? 'Queueing...'
                  : deliveryTiming === 'SCHEDULED'
                    ? 'Yes, Schedule Campaign'
                    : 'Yes, Queue Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CANCEL CAMPAIGN MODAL                                              */}
      {/* ------------------------------------------------------------------ */}

      {campaignToCancel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                <XCircle size={24} />
              </div>

              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-900">
                  Cancel Campaign?
                </h3>

                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  This will prevent the campaign from continuing
                  to process. Already-delivered notifications
                  cannot be recalled.
                </p>
              </div>
            </div>

            <div className="mt-4 bg-slate-50 rounded-2xl border border-slate-100 p-4">
              <div className="text-sm font-extrabold text-slate-900 truncate">
                {campaignToCancel.title}
              </div>

              <div className="text-xs text-slate-500 mt-1 line-clamp-3">
                {campaignToCancel.body}
              </div>

              <div className="flex items-center gap-2 mt-3">
                {renderStatusBadge(
                  campaignToCancel.pushStatus
                )}

                <span className="text-[10px] text-slate-500 font-semibold">
                  {(
                    campaignToCancel.totalTargets || 0
                  ).toLocaleString()}{' '}
                  targets
                </span>
              </div>
            </div>

            {campaignToCancel.pushStatus ===
              'PROCESSING' && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-[11px] text-amber-800 leading-relaxed">
                <strong>Worker is currently processing this
                campaign.</strong>{' '}
                Cancellation will stop future batches, but
                messages already delivered may remain delivered.
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                type="button"
                onClick={() =>
                  setCampaignToCancel(null)
                }
                disabled={Boolean(cancellingId)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition disabled:opacity-50"
              >
                Keep Campaign
              </button>

              <button
                type="button"
                onClick={() =>
                  handleCancelCampaign(campaignToCancel)
                }
                disabled={Boolean(cancellingId)}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow transition disabled:opacity-50 flex items-center gap-2"
              >
                {cancellingId === campaignToCancel.id ? (
                  <>
                    <RefreshCw
                      size={13}
                      className="animate-spin"
                    />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <XCircle size={13} />
                    Yes, Cancel Campaign
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}