import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  useStatusIncidents, 
  useCreateIncident, 
  useUpdateIncident,
  type StatusIncident 
} from '@/hooks/useAdminFeatures';
import { toast } from 'sonner';
import { 
  AlertCircle, Plus, X, CheckCircle, AlertTriangle, 
  Clock, Eye, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const SEVERITY_COLORS = {
  minor: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50',
  major: 'bg-orange-500/20 text-orange-500 border-orange-500/50',
  critical: 'bg-red-500/20 text-red-500 border-red-500/50',
};

const STATUS_COLORS = {
  investigating: 'bg-red-500/20 text-red-500',
  identified: 'bg-orange-500/20 text-orange-500',
  monitoring: 'bg-blue-500/20 text-blue-500',
  resolved: 'bg-green-500/20 text-green-500',
};

const SERVICES = [
  'Tatakai Website',
  'Video Streaming',
  'API Services',
  'Authentication',
  'Database',
  'Search',
];

export function IncidentManager() {
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newIncident, setNewIncident] = useState({
    title: '',
    description: '',
    status: 'investigating' as StatusIncident['status'],
    severity: 'minor' as StatusIncident['severity'],
    affected_services: [] as string[],
  });
  const [updateMessage, setUpdateMessage] = useState('');

  const { data: incidents = [], isLoading } = useStatusIncidents(false);
  const createIncident = useCreateIncident();
  const updateIncident = useUpdateIncident();

  const handleCreate = async () => {
    if (!newIncident.title.trim() || !newIncident.description.trim()) {
      toast.error('Please fill in title and description');
      return;
    }

    try {
      await createIncident.mutateAsync(newIncident);
      toast.success('Incident created');
      setShowForm(false);
      setNewIncident({
        title: '',
        description: '',
        status: 'investigating',
        severity: 'minor',
        affected_services: [],
      });
    } catch (error) {
      toast.error('Failed to create incident');
    }
  };

  const handleStatusUpdate = async (incident: StatusIncident, newStatus: StatusIncident['status']) => {
    try {
      await updateIncident.mutateAsync({
        incidentId: incident.id,
        updates: { status: newStatus },
        updateMessage: updateMessage || `Status changed to ${newStatus}`,
      });
      toast.success('Incident updated');
      setUpdateMessage('');
    } catch (error) {
      toast.error('Failed to update incident');
    }
  };

  const toggleService = (service: string) => {
    setNewIncident(prev => ({
      ...prev,
      affected_services: prev.affected_services.includes(service)
        ? prev.affected_services.filter(s => s !== service)
        : [...prev.affected_services, service],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-primary" />
          Status Page Incidents
        </h2>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Incident
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="p-6 rounded-xl bg-muted/30 border border-muted space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Create New Incident</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Title</label>
              <Input
                value={newIncident.title}
                onChange={(e) => setNewIncident(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Video streaming degraded performance"
                className="bg-muted/50"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Description</label>
              <Textarea
                value={newIncident.description}
                onChange={(e) => setNewIncident(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the incident..."
                className="bg-muted/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Severity</label>
                <div className="flex gap-2">
                  {(['minor', 'major', 'critical'] as const).map((severity) => (
                    <button
                      key={severity}
                      onClick={() => setNewIncident(prev => ({ ...prev, severity }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        newIncident.severity === severity 
                          ? SEVERITY_COLORS[severity] 
                          : 'border-muted text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      {severity.charAt(0).toUpperCase() + severity.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <div className="flex gap-2 flex-wrap">
                  {(['investigating', 'identified', 'monitoring'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setNewIncident(prev => ({ ...prev, status }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        newIncident.status === status 
                          ? STATUS_COLORS[status] 
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Affected Services</label>
              <div className="flex flex-wrap gap-2">
                {SERVICES.map((service) => (
                  <button
                    key={service}
                    onClick={() => toggleService(service)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      newIncident.affected_services.includes(service)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {service}
                  </button>
                ))}
              </div>
            </div>

            <Button 
              onClick={handleCreate} 
              disabled={createIncident.isPending}
              className="gap-2"
            >
              {createIncident.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Incident
            </Button>
          </div>
        </div>
      )}

      {/* Incidents List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
          <p className="text-muted-foreground">No incidents reported</p>
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((incident) => (
            <div
              key={incident.id}
              className={`p-4 rounded-xl border transition-all ${
                incident.is_active ? 'border-orange-500/50 bg-orange-500/5' : 'border-muted bg-muted/10'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${SEVERITY_COLORS[incident.severity]}`}>
                      {incident.severity.toUpperCase()}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[incident.status]}`}>
                      {incident.status}
                    </span>
                    {incident.is_active && (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 text-xs font-bold">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-lg">{incident.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{incident.description}</p>
                  
                  {incident.affected_services.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {incident.affected_services.map((service) => (
                        <span key={service} className="px-2 py-0.5 rounded-full bg-muted/50 text-xs">
                          {service}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-2">
                    Created {formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}
                  </p>
                </div>

                <button
                  onClick={() => setExpandedId(expandedId === incident.id ? null : incident.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expandedId === incident.id ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Expanded Section */}
              {expandedId === incident.id && (
                <div className="mt-4 pt-4 border-t border-muted space-y-4">
                  {/* Updates */}
                  {incident.updates && incident.updates.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Updates</h4>
                      {incident.updates.map((update) => (
                        <div key={update.id} className="pl-4 border-l-2 border-muted">
                          <p className="text-sm">{update.message}</p>
                          <p className="text-xs text-muted-foreground">
                            Status: {update.status} • {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Update Status */}
                  {incident.is_active && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Update Status</h4>
                      <div className="flex gap-2">
                        <Input
                          value={updateMessage}
                          onChange={(e) => setUpdateMessage(e.target.value)}
                          placeholder="Update message..."
                          className="flex-1 bg-muted/50"
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {(['investigating', 'identified', 'monitoring', 'resolved'] as const).map((status) => (
                          <Button
                            key={status}
                            size="sm"
                            variant={status === 'resolved' ? 'default' : 'outline'}
                            onClick={() => handleStatusUpdate(incident, status)}
                            disabled={updateIncident.isPending}
                          >
                            {status === 'resolved' && <CheckCircle className="w-3 h-3 mr-1" />}
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
