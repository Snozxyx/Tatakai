import React, { useState } from 'react';
import { Eye, Settings, Palette, Type, Image, Link, Calendar, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PopupBuilderProps {
  className?: string;
  initialData?: PopupFormData;
  onSave?: (data: PopupFormData) => void;
  onPreview?: (data: PopupFormData) => void;
}

interface PopupFormData {
  title: string;
  content: string;
  popup_type: 'info' | 'warning' | 'alert' | 'promotion' | 'maintenance';
  image_url?: string;
  action_url?: string;
  action_label?: string;
  priority: number;
  start_date: string;
  end_date?: string;
  display_frequency: 'once' | 'daily' | 'session' | 'always';
  show_for_guests: boolean;
  show_for_logged_in: boolean;
  variant_b: {
    title: string;
    content: string;
    image_url: string;
  };
  track_clicks: boolean;
  track_conversions: boolean;
}

export function PopupBuilder({ className, initialData, onSave, onPreview }: PopupBuilderProps) {
  const [activeTab, setActiveTab] = useState<'design' | 'content' | 'settings' | 'preview'>('design');
  const [popupData, setPopupData] = useState({
    title: initialData?.title || '',
    content: initialData?.content || '',
    popup_type: initialData?.popup_type || 'info',
    image_url: initialData?.image_url || '',
    action_url: initialData?.action_url || '',
    action_label: initialData?.action_label || '',
    priority: initialData?.priority || 0,
    start_date: initialData?.start_date || new Date().toISOString(),
    end_date: initialData?.end_date || '',
    display_frequency: initialData?.display_frequency || 'once',
    show_for_guests: initialData?.show_for_guests ?? true,
    show_for_logged_in: initialData?.show_for_logged_in ?? true,
    // A/B testing variants
    variant_b: {
      title: '',
      content: '',
      image_url: '',
    },
    // Tracking
    track_clicks: true,
    track_conversions: true,
  });

  const colorSchemes = {
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: 'bg-blue-500',
      text: 'text-blue-800',
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      icon: 'bg-yellow-500',
      text: 'text-yellow-800',
    },
    alert: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'bg-red-500',
      text: 'text-red-800',
    },
    promotion: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      icon: 'bg-green-500',
      text: 'text-green-800',
    },
    maintenance: {
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      icon: 'bg-purple-500',
      text: 'text-purple-800',
    },
  };

  const handleSave = () => {
    if (onSave) {
      onSave(popupData);
    }
  };

  const handlePreview = () => {
    if (onPreview) {
      onPreview(popupData);
    }
  };

  const renderDesignTab = () => (
    <div className="space-y-6">
      {/* Type Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Popup Type</label>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(colorSchemes).map(([type, scheme]) => (
            <button
              key={type}
              onClick={() => setPopupData(prev => ({ ...prev, popup_type: type }))}
              className={cn(
                "p-4 rounded-lg border-2 transition-all",
                popupData.popup_type === type 
                  ? `${scheme.border} ${scheme.bg}` 
                  : "border-border hover:border-muted-foreground"
              )}
            >
              <div className={cn("w-8 h-8 rounded-full mx-auto mb-2", scheme.icon)} />
              <div className="text-sm font-medium capitalize">{type}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium mb-3">Image</label>
        <div className="flex items-center gap-4">
          {popupData.image_url && (
            <img
              src={popupData.image_url}
              alt="Popup preview"
              className="w-16 h-16 rounded-lg object-cover border"
            />
          )}
          <div className="flex-1">
            <input
              type="url"
              placeholder="https://example.com/image.jpg"
              value={popupData.image_url}
              onChange={(e) => setPopupData(prev => ({ ...prev, image_url: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            />
          </div>
          <button className="px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors">
            <Image className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium mb-2">Priority (0-10)</label>
        <input
          type="range"
          min="0"
          max="10"
          value={popupData.priority}
          onChange={(e) => setPopupData(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>Low</span>
          <span className="font-medium">{popupData.priority}</span>
          <span>High</span>
        </div>
      </div>
    </div>
  );

  const renderContentTab = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Title</label>
        <input
          type="text"
          value={popupData.title}
          onChange={(e) => setPopupData(prev => ({ ...prev, title: e.target.value }))}
          className="w-full px-3 py-2 border border-border rounded-md"
          placeholder="Enter popup title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Content (HTML supported)</label>
        <textarea
          value={popupData.content}
          onChange={(e) => setPopupData(prev => ({ ...prev, content: e.target.value }))}
          className="w-full px-3 py-2 border border-border rounded-md"
          rows={6}
          placeholder="Enter popup content... HTML tags like <strong>, <em>, <a>, <br> are supported"
        />
        <div className="text-xs text-muted-foreground mt-1">
          HTML tags allowed: strong, em, a, br, p, ul, ol, li
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Action URL (optional)</label>
          <input
            type="url"
            value={popupData.action_url}
            onChange={(e) => setPopupData(prev => ({ ...prev, action_url: e.target.value }))}
            className="w-full px-3 py-2 border border-border rounded-md"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Action Button Label</label>
          <input
            type="text"
            value={popupData.action_label}
            onChange={(e) => setPopupData(prev => ({ ...prev, action_label: e.target.value }))}
            className="w-full px-3 py-2 border border-border rounded-md"
            placeholder="Click here"
          />
        </div>
      </div>

      {/* A/B Testing Variants */}
      <div className="border-t pt-6">
        <h4 className="text-sm font-medium mb-4">A/B Testing Variant B (Optional)</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Variant B Title</label>
            <input
              type="text"
              value={popupData.variant_b.title}
              onChange={(e) => setPopupData(prev => ({ 
                ...prev, 
                variant_b: { ...prev.variant_b, title: e.target.value }
              }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              placeholder="Alternative title for A/B testing"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Variant B Content</label>
            <textarea
              value={popupData.variant_b.content}
              onChange={(e) => setPopupData(prev => ({ 
                ...prev, 
                variant_b: { ...prev.variant_b, content: e.target.value }
              }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              rows={3}
              placeholder="Alternative content for A/B testing"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Variant B Image URL</label>
            <input
              type="url"
              value={popupData.variant_b.image_url}
              onChange={(e) => setPopupData(prev => ({ 
                ...prev, 
                variant_b: { ...prev.variant_b, image_url: e.target.value }
              }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              placeholder="Alternative image URL"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettingsTab = () => (
    <div className="space-y-6">
      {/* Scheduling */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Schedule
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="datetime-local"
              value={popupData.start_date}
              onChange={(e) => setPopupData(prev => ({ ...prev, start_date: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date (optional)</label>
            <input
              type="datetime-local"
              value={popupData.end_date}
              onChange={(e) => setPopupData(prev => ({ ...prev, end_date: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Audience */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Target Audience
        </h4>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={popupData.show_for_guests}
              onChange={(e) => setPopupData(prev => ({ ...prev, show_for_guests: e.target.checked }))}
              className="rounded border-border"
            />
            <span className="text-sm">Show to guest users</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={popupData.show_for_logged_in}
              onChange={(e) => setPopupData(prev => ({ ...prev, show_for_logged_in: e.target.checked }))}
              className="rounded border-border"
            />
            <span className="text-sm">Show to logged-in users</span>
          </label>
        </div>
      </div>

      {/* Frequency */}
      <div>
        <h4 className="text-sm font-medium mb-3">Display Frequency</h4>
        <select
          value={popupData.display_frequency}
          onChange={(e) => setPopupData(prev => ({ ...prev, display_frequency: e.target.value as any }))}
          className="w-full px-3 py-2 border border-border rounded-md"
        >
          <option value="once">Once per user</option>
          <option value="daily">Once per day</option>
          <option value="session">Once per session</option>
          <option value="always">Every visit</option>
        </select>
      </div>

      {/* Tracking */}
      <div>
        <h4 className="text-sm font-medium mb-3">Analytics & Tracking</h4>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={popupData.track_clicks}
              onChange={(e) => setPopupData(prev => ({ ...prev, track_clicks: e.target.checked }))}
              className="rounded border-border"
            />
            <span className="text-sm">Track click-through rate</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={popupData.track_conversions}
              onChange={(e) => setPopupData(prev => ({ ...prev, track_conversions: e.target.checked }))}
              className="rounded border-border"
            />
            <span className="text-sm">Track conversion rate</span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderPreviewTab = () => {
    const scheme = colorSchemes[popupData.popup_type];
    
    return (
      <div className="space-y-6">
        <div className="text-sm text-muted-foreground">
          Live preview of how your popup will appear to users
        </div>

        {/* Main Popup Preview */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted p-3 border-b">
            <h4 className="text-sm font-medium">Main Variant</h4>
          </div>
          <div className="p-6 bg-background">
            <div className={cn(
              "p-4 rounded-lg border-l-4",
              scheme.bg,
              scheme.border
            )}>
              <div className="flex items-start gap-4">
                {popupData.image_url && (
                  <img
                    src={popupData.image_url}
                    alt="Popup"
                    className="w-12 h-12 rounded object-cover"
                  />
                )}
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold", scheme.icon)}>
                  {popupData.popup_type === 'info' && 'i'}
                  {popupData.popup_type === 'warning' && '!'}
                  {popupData.popup_type === 'alert' && '!'}
                  {popupData.popup_type === 'promotion' && '★'}
                  {popupData.popup_type === 'maintenance' && '🔧'}
                </div>
                
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">{popupData.title || 'Popup Title'}</h3>
                  <div 
                    className="text-sm text-muted-foreground prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: popupData.content || 'Popup content goes here...' }}
                  />
                  
                  {popupData.action_url && popupData.action_label && (
                    <button className="mt-3 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors">
                      {popupData.action_label}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Variant B Preview (if A/B testing enabled) */}
        {(popupData.variant_b.title || popupData.variant_b.content) && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted p-3 border-b">
              <h4 className="text-sm font-medium">Variant B (A/B Testing)</h4>
            </div>
            <div className="p-6 bg-background">
              <div className={cn(
                "p-4 rounded-lg border-l-4",
                scheme.bg,
                scheme.border
              )}>
                <div className="flex items-start gap-4">
                  {popupData.variant_b.image_url && (
                    <img
                      src={popupData.variant_b.image_url}
                      alt="Variant B"
                      className="w-12 h-12 rounded object-cover"
                    />
                  )}
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold", scheme.icon)}>
                    B
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">{popupData.variant_b.title || 'Variant B Title'}</h3>
                    <div 
                      className="text-sm text-muted-foreground prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: popupData.variant_b.content || 'Variant B content...' }}
                    />
                    
                    {popupData.action_url && popupData.action_label && (
                      <button className="mt-3 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors">
                        {popupData.action_label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Preview */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted p-3 border-b">
            <h4 className="text-sm font-medium">Mobile Preview</h4>
          </div>
          <div className="p-6 bg-background">
            <div className="max-w-sm mx-auto">
              <div className={cn(
                "p-4 rounded-lg border-l-4",
                scheme.bg,
                scheme.border
              )}>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {popupData.image_url && (
                      <img
                        src={popupData.image_url}
                        alt="Popup"
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold", scheme.icon)}>
                      {popupData.popup_type === 'info' && 'i'}
                      {popupData.popup_type === 'warning' && '!'}
                      {popupData.popup_type === 'alert' && '!'}
                      {popupData.popup_type === 'promotion' && '★'}
                      {popupData.popup_type === 'maintenance' && '🔧'}
                    </div>
                  </div>
                  
                  <h3 className="text-base font-semibold">{popupData.title || 'Popup Title'}</h3>
                  <div 
                    className="text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: (popupData.content || 'Popup content...').substring(0, 100) + '...' }}
                  />
                  
                  {popupData.action_url && popupData.action_label && (
                    <button className="w-full px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors">
                      {popupData.action_label}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("bg-background border border-border rounded-lg", className)}>
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Popup Builder</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create and customize global popup announcements
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreview}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors"
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Save Popup
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {[
          { id: 'design', label: 'Design', icon: Palette },
          { id: 'content', label: 'Content', icon: Type },
          { id: 'settings', label: 'Settings', icon: Settings },
          { id: 'preview', label: 'Preview', icon: Eye },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'design' && renderDesignTab()}
        {activeTab === 'content' && renderContentTab()}
        {activeTab === 'settings' && renderSettingsTab()}
        {activeTab === 'preview' && renderPreviewTab()}
      </div>
    </div>
  );
}