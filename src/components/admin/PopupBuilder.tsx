import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  useAdminPopups,
  useCreatePopup,
  useUpdatePopup,
  useDeletePopup,
  type Popup
} from '@/hooks/admin/useAdminFeatures';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Megaphone, Plus, X, Trash2, Eye, EyeOff, Loader2,
  Monitor, Smartphone, Edit2
} from 'lucide-react';
import { formatDistanceToNow } from '@/lib/localeFormat';
import { useConfirm } from '@/components/ui/confirm-dialog';

const POPUP_TYPES = [
  { value: 'banner', get label() { return uiI18n.t('app.banner_c8af83fb'); }, get description() { return uiI18n.t('app.top_of_page_notification_bar_70214fbd'); } },
  { value: 'modal', get label() { return uiI18n.t('app.modal_d44c2c52'); }, get description() { return uiI18n.t('app.center_screen_popup_8852fafa'); } },
  { value: 'toast', get label() { return uiI18n.t('app.toast_3babbd03'); }, get description() { return uiI18n.t('app.small_notification_corner_b406408c'); } },
  { value: 'fullscreen', get label() { return uiI18n.t('app.fullscreen_bb08d10b'); }, get description() { return uiI18n.t('app.full_page_overlay_2bb2993e'); } },
];

const USER_TYPES = [
  { value: 'all', get label() { return uiI18n.t('app.all_users_b4f25a14'); } },
  { value: 'guests', get label() { return uiI18n.t('app.guests_only_fd49d61b'); } },
  { value: 'logged_in', get label() { return uiI18n.t('app.logged_in_only_f28ae2e6'); } },
  { value: 'premium', get label() { return uiI18n.t('app.premium_only_97e57146'); } },
];

const FREQUENCIES = [
  { value: 'once', get label() { return uiI18n.t('app.once_d9c76878'); } },
  { value: 'always', get label() { return uiI18n.t('app.always_a91bcce8'); } },
  { value: 'daily', get label() { return uiI18n.t('app.daily_728298d3'); } },
  { value: 'weekly', get label() { return uiI18n.t('app.weekly_158f3da5'); } },
];

export function PopupBuilder() {
  useUiTranslation();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingPopup, setEditingPopup] = useState<Popup | null>(null);
  const [newPageInput, setNewPageInput] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    popup_type: 'banner' as Popup['popup_type'],
    background_color: '#1B1919',
    text_color: '#FFFFFF',
    accent_color: '#FF1493',
    image_url: '',
    action_text: '',
    action_url: '',
    dismiss_text: 'Dismiss',
    target_pages: [] as string[],
    target_user_type: 'all' as Popup['target_user_type'],
    show_on_mobile: true,
    show_on_desktop: true,
    start_date: '',
    end_date: '',
    frequency: 'once' as Popup['frequency'],
    priority: 1,
    is_active: true,
    use_theme_colors: false,
  });

  const { data: popups = [], isLoading } = useAdminPopups();
  const createPopup = useCreatePopup();
  const updatePopup = useUpdatePopup();
  const deletePopup = useDeletePopup();

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      popup_type: 'banner',
      background_color: '#1B1919',
      text_color: '#FFFFFF',
      accent_color: '#FF1493',
      image_url: '',
      action_text: '',
      action_url: '',
      dismiss_text: 'Dismiss',
      target_pages: [],
      target_user_type: 'all',
      show_on_mobile: true,
      show_on_desktop: true,
      start_date: '',
      end_date: '',
      frequency: 'once',
      priority: 1,
      is_active: true,
      use_theme_colors: false,
    });
    setEditingPopup(null);
  };

  const handleEdit = (popup: Popup) => {
    setFormData({
      title: popup.title,
      content: popup.content || '',
      popup_type: popup.popup_type,
      background_color: popup.background_color,
      text_color: popup.text_color,
      accent_color: popup.accent_color,
      image_url: popup.image_url || '',
      action_text: popup.action_text || '',
      action_url: popup.action_url || '',
      dismiss_text: popup.dismiss_text,
      target_pages: popup.target_pages,
      target_user_type: popup.target_user_type,
      show_on_mobile: popup.show_on_mobile,
      show_on_desktop: popup.show_on_desktop,
      start_date: popup.start_date ? popup.start_date.split('T')[0] : '',
      end_date: popup.end_date ? popup.end_date.split('T')[0] : '',
      frequency: popup.frequency,
      priority: popup.priority,
      is_active: popup.is_active,
      use_theme_colors: popup.use_theme_colors || false,
    });
    setEditingPopup(popup);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error(uiI18n.t('app.please_enter_a_title_181d0164'));
      return;
    }

    try {
      const data = {
        ...formData,
        start_date: (formData.start_date && !isNaN(new Date(formData.start_date).getTime()))
          ? new Date(formData.start_date).toISOString()
          : null,
        end_date: (formData.end_date && !isNaN(new Date(formData.end_date).getTime()))
          ? new Date(formData.end_date).toISOString()
          : null,
        content: formData.content || null,
        image_url: formData.image_url || null,
        action_text: formData.action_text || null,
        action_url: formData.action_url || null,
      };

      if (editingPopup) {
        await updatePopup.mutateAsync({ id: editingPopup.id, updates: data });
        toast.success(uiI18n.t('app.popup_updated_62d4abb4'));
      } else {
        await createPopup.mutateAsync(data as Omit<Popup, 'id' | 'created_by' | 'created_at' | 'updated_at'>);
        toast.success(uiI18n.t('app.popup_created_c3f97fd5'));
      }
      setShowForm(false);
      resetForm();
    } catch (error) {
      toast.error(uiI18n.t('app.failed_to_save_popup_cd29266f'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ get title() { return uiI18n.t('app.are_you_sure_you_want_to_delete_this_popup_98c159f9'); }, destructive: true }))) return;

    try {
      await deletePopup.mutateAsync(id);
      toast.success(uiI18n.t('app.popup_deleted_f6991264'));
    } catch (error) {
      toast.error(uiI18n.t('app.failed_to_delete_popup_2f281a7a'));
    }
  };

  const handleToggleActive = async (popup: Popup) => {
    try {
      await updatePopup.mutateAsync({
        id: popup.id,
        updates: { is_active: !popup.is_active }
      });
      toast.success(popup.is_active ? uiI18n.t('app.popup_deactivated_ac2abaf3') : uiI18n.t('app.popup_activated_49dc177c'));
    } catch (error) {
      toast.error(uiI18n.t('app.failed_to_update_popup_523fc0ea'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          {uiI18n.t('app.popup_builder_6eb41ae5')}
        </h2>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          {uiI18n.t('app.new_popup_c6f10c91')}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="p-6 rounded-xl bg-muted/30 border border-muted space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{editingPopup ? uiI18n.t('app.edit_popup_c4ece572') : uiI18n.t('app.create_new_popup_024cacc0')}</h3>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.title_9616975c')}</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder={uiI18n.t('app.popup_title_b5c01cc9')}
                  className="bg-muted/50"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.content_4f9be057')}</label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder={uiI18n.t('app.popup_content_68857adf')}
                  className="bg-muted/50"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.popup_type_19fe1429')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {POPUP_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormData(prev => ({ ...prev, popup_type: type.value as Popup['popup_type'] }))}
                      className={`p-3 rounded-lg border text-left transition-all ${formData.popup_type === type.value
                        ? 'border-primary bg-primary/10'
                        : 'border-muted hover:border-foreground/30'}`}
                    >
                      <p className="font-medium text-sm">{type.label}</p>
                      <p className="text-xs text-muted-foreground">{type.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.background_64dd60fe')}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.background_color}
                      onChange={(e) => setFormData(prev => ({ ...prev, background_color: e.target.value }))}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input
                      value={formData.background_color}
                      onChange={(e) => setFormData(prev => ({ ...prev, background_color: e.target.value }))}
                      className="bg-muted/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.text_c3328c39')}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.text_color}
                      onChange={(e) => setFormData(prev => ({ ...prev, text_color: e.target.value }))}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input
                      value={formData.text_color}
                      onChange={(e) => setFormData(prev => ({ ...prev, text_color: e.target.value }))}
                      className="bg-muted/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.accent_233064dd')}</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.accent_color}
                      onChange={(e) => setFormData(prev => ({ ...prev, accent_color: e.target.value }))}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input
                      value={formData.accent_color}
                      onChange={(e) => setFormData(prev => ({ ...prev, accent_color: e.target.value }))}
                      className="bg-muted/50"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.target_pages_empty_for_all_a583420a')}</label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newPageInput}
                    onChange={(e) => setNewPageInput(e.target.value)}
                    placeholder={uiI18n.t('app.e_g_watch_or_anime_caf81128')}
                    className="bg-muted/50"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (newPageInput && !formData.target_pages.includes(newPageInput)) {
                        setFormData(prev => ({
                          ...prev,
                          target_pages: [...prev.target_pages, newPageInput]
                        }));
                        setNewPageInput('');
                      }
                    }}
                  >
                    {uiI18n.t('app.add_61cc55aa')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.target_pages.map(page => (
                    <Badge key={page} variant="secondary" className="gap-1 pl-2 pr-1">
                      {page}
                      <button
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          target_pages: prev.target_pages.filter(p => p !== page)
                        }))}
                        className="hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.image_url_35c80f96')}</label>
                <Input
                  value={formData.image_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                  placeholder="https://..."
                  className="bg-muted/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.action_button_text_887190b3')}</label>
                  <Input
                    value={formData.action_text}
                    onChange={(e) => setFormData(prev => ({ ...prev, action_text: e.target.value }))}
                    placeholder={uiI18n.t('app.learn_more_378cbbf5')}
                    className="bg-muted/50"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.action_url_d90e30a4')}</label>
                  <Input
                    value={formData.action_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, action_url: e.target.value }))}
                    placeholder="/page or https://..."
                    className="bg-muted/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.target_users_1214f419')}</label>
                <div className="flex gap-2 flex-wrap">
                  {USER_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormData(prev => ({ ...prev, target_user_type: type.value as Popup['target_user_type'] }))}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${formData.target_user_type === type.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.frequency_89836a87')}</label>
                <div className="flex gap-2 flex-wrap">
                  {FREQUENCIES.map(freq => (
                    <button
                      key={freq.value}
                      onClick={() => setFormData(prev => ({ ...prev, frequency: freq.value as Popup['frequency'] }))}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${formData.frequency === freq.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}
                    >
                      {freq.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.start_date_9d7ab1a5')}</label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    className="bg-muted/50"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.end_date_84b14781')}</label>
                  <Input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    className="bg-muted/50"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.show_on_desktop}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_on_desktop: checked }))}
                  />
                  <Monitor className="w-4 h-4" />
                  <span className="text-sm">{uiI18n.t('app.desktop_532c67fe')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.show_on_mobile}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_on_mobile: checked }))}
                  />
                  <Smartphone className="w-4 h-4" />
                  <span className="text-sm">{uiI18n.t('app.mobile_b1d70245')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                  />
                  <span className="text-sm">{uiI18n.t('app.active_a733b809')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.use_theme_colors}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, use_theme_colors: checked }))}
                  />
                  <span className="text-sm">{uiI18n.t('app.themed_3153f04d')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="text-sm font-medium mb-2 block">{uiI18n.t('app.preview_f1fbb2b4')}</label>
            <div
              className="p-4 rounded-lg border"
              style={{
                backgroundColor: formData.background_color,
                color: formData.text_color,
                borderColor: formData.accent_color
              }}
            >
              <h4 className="font-semibold">{formData.title || uiI18n.t('app.popup_title_f406ca12')}</h4>
              {formData.content && <p className="text-sm mt-1 opacity-80">{formData.content}</p>}
              {formData.action_text && (
                <button
                  className="mt-3 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: formData.accent_color, color: formData.text_color }}
                >
                  {formData.action_text}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSave} disabled={createPopup.isPending || updatePopup.isPending} className="gap-2 flex-1 md:flex-none justify-center">
              {(createPopup.isPending || updatePopup.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingPopup ? uiI18n.t('app.update_popup_1591d801') : uiI18n.t('app.create_popup_dc36f180')}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 md:flex-none justify-center">
              {uiI18n.t('app.cancel_77dfd213')}
            </Button>
          </div>
        </div>
      )}

      {/* Popups List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : popups.length === 0 ? (
        <div className="text-center py-12">
          <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{uiI18n.t('app.no_popups_created_yet_ba82741c')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {popups.map((popup) => (
            <div
              key={popup.id}
              className={`p-4 rounded-xl border transition-all ${popup.is_active ? 'border-primary/50' : 'border-muted opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">
                      {popup.popup_type}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-xs">
                      {popup.frequency}
                    </span>
                    {popup.is_active ? (
                      <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 text-xs font-bold">
                        {uiI18n.t('app.active_c72633f6')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                        {uiI18n.t('app.inactive_7c07798e')}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold">{popup.title}</h3>
                  {popup.content && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{popup.content}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {uiI18n.t('app.created_accf40c8')} {formatDistanceToNow(new Date(popup.created_at), { addSuffix: true })}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(popup)}
                  >
                    {popup.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(popup)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(popup.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
