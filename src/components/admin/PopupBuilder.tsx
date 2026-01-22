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
} from '@/hooks/useAdminFeatures';
import { toast } from 'sonner';
import { 
  Megaphone, Plus, X, Trash2, Eye, EyeOff, Loader2,
  Monitor, Smartphone, Edit2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const POPUP_TYPES = [
  { value: 'banner', label: 'Banner', description: 'Top of page notification bar' },
  { value: 'modal', label: 'Modal', description: 'Center screen popup' },
  { value: 'toast', label: 'Toast', description: 'Small notification corner' },
  { value: 'fullscreen', label: 'Fullscreen', description: 'Full page overlay' },
];

const USER_TYPES = [
  { value: 'all', label: 'All Users' },
  { value: 'guests', label: 'Guests Only' },
  { value: 'logged_in', label: 'Logged In Only' },
  { value: 'premium', label: 'Premium Only' },
];

const FREQUENCIES = [
  { value: 'once', label: 'Once' },
  { value: 'always', label: 'Always' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export function PopupBuilder() {
  const [showForm, setShowForm] = useState(false);
  const [editingPopup, setEditingPopup] = useState<Popup | null>(null);
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
    });
    setEditingPopup(popup);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    try {
      const data = {
        ...formData,
        start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
        end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
        content: formData.content || null,
        image_url: formData.image_url || null,
        action_text: formData.action_text || null,
        action_url: formData.action_url || null,
      };

      if (editingPopup) {
        await updatePopup.mutateAsync({ id: editingPopup.id, updates: data });
        toast.success('Popup updated');
      } else {
        await createPopup.mutateAsync(data as Omit<Popup, 'id' | 'created_by' | 'created_at' | 'updated_at'>);
        toast.success('Popup created');
      }
      setShowForm(false);
      resetForm();
    } catch (error) {
      toast.error('Failed to save popup');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this popup?')) return;
    
    try {
      await deletePopup.mutateAsync(id);
      toast.success('Popup deleted');
    } catch (error) {
      toast.error('Failed to delete popup');
    }
  };

  const handleToggleActive = async (popup: Popup) => {
    try {
      await updatePopup.mutateAsync({ 
        id: popup.id, 
        updates: { is_active: !popup.is_active } 
      });
      toast.success(popup.is_active ? 'Popup deactivated' : 'Popup activated');
    } catch (error) {
      toast.error('Failed to update popup');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          Popup Builder
        </h2>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          New Popup
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="p-6 rounded-xl bg-muted/30 border border-muted space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{editingPopup ? 'Edit Popup' : 'Create New Popup'}</h3>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Title *</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Popup title"
                  className="bg-muted/50"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Content</label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Popup content..."
                  className="bg-muted/50"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Popup Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {POPUP_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormData(prev => ({ ...prev, popup_type: type.value as Popup['popup_type'] }))}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        formData.popup_type === type.value
                          ? 'border-primary bg-primary/10'
                          : 'border-muted hover:border-foreground/30'
                      }`}
                    >
                      <p className="font-medium text-sm">{type.label}</p>
                      <p className="text-xs text-muted-foreground">{type.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Background</label>
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
                  <label className="text-sm font-medium mb-2 block">Text</label>
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
                  <label className="text-sm font-medium mb-2 block">Accent</label>
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
                <label className="text-sm font-medium mb-2 block">Image URL</label>
                <Input
                  value={formData.image_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                  placeholder="https://..."
                  className="bg-muted/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Action Button Text</label>
                  <Input
                    value={formData.action_text}
                    onChange={(e) => setFormData(prev => ({ ...prev, action_text: e.target.value }))}
                    placeholder="Learn More"
                    className="bg-muted/50"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Action URL</label>
                  <Input
                    value={formData.action_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, action_url: e.target.value }))}
                    placeholder="/page or https://..."
                    className="bg-muted/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Target Users</label>
                <div className="flex gap-2 flex-wrap">
                  {USER_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormData(prev => ({ ...prev, target_user_type: type.value as Popup['target_user_type'] }))}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                        formData.target_user_type === type.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Frequency</label>
                <div className="flex gap-2 flex-wrap">
                  {FREQUENCIES.map(freq => (
                    <button
                      key={freq.value}
                      onClick={() => setFormData(prev => ({ ...prev, frequency: freq.value as Popup['frequency'] }))}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                        formData.frequency === freq.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {freq.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Start Date</label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    className="bg-muted/50"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">End Date</label>
                  <Input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    className="bg-muted/50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.show_on_desktop}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_on_desktop: checked }))}
                  />
                  <Monitor className="w-4 h-4" />
                  <span className="text-sm">Desktop</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.show_on_mobile}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_on_mobile: checked }))}
                  />
                  <Smartphone className="w-4 h-4" />
                  <span className="text-sm">Mobile</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                  />
                  <span className="text-sm">Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="text-sm font-medium mb-2 block">Preview</label>
            <div 
              className="p-4 rounded-lg border"
              style={{ 
                backgroundColor: formData.background_color, 
                color: formData.text_color,
                borderColor: formData.accent_color 
              }}
            >
              <h4 className="font-semibold">{formData.title || 'Popup Title'}</h4>
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

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={createPopup.isPending || updatePopup.isPending} className="gap-2">
              {(createPopup.isPending || updatePopup.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingPopup ? 'Update Popup' : 'Create Popup'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
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
          <p className="text-muted-foreground">No popups created yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {popups.map((popup) => (
            <div
              key={popup.id}
              className={`p-4 rounded-xl border transition-all ${
                popup.is_active ? 'border-primary/50' : 'border-muted opacity-60'
              }`}
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
                        ACTIVE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold">{popup.title}</h3>
                  {popup.content && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{popup.content}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Created {formatDistanceToNow(new Date(popup.created_at), { addSuffix: true })}
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
