import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Shield, Lock, Key, Server, CheckCircle2, AlertCircle, Users, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Modal } from '../common/Modal.js';

interface LDAPSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LDAPSignInModal: React.FC<LDAPSignInModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { ldapLogin, switchUser, allUsers, currentUser } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'LDAP' | 'DIRECTORY'>('LDAP');

  const activeDomain = currentUser?.ldapDomain || 'EXPRESSBANK.AZ';

  const handleLDAPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const result = await ldapLogin({
      usernameOrEmail,
      password,
      ldapDomain: activeDomain,
      distributionGroup: selectedGroup || undefined,
      rememberMe,
    });

    setIsLoading(false);

    if (result.success) {
      setSuccessMessage(`Active Directory LDAP bind successful for '${usernameOrEmail}'.`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
        setSuccessMessage(null);
      }, 700);
    } else {
      setErrorMessage(result.message || 'LDAP authentication failed.');
    }
  };

  const handleQuickAccountSelect = (u: any) => {
    setUsernameOrEmail(u.username);
    setPassword('');
    setErrorMessage(null);
  };

  const infosecUsers = allUsers.filter((u) =>
    u.distributionGroups?.includes('İnformasiya Təhlükəsizliyi DG') ||
    (u.departmentId && u.departmentId.startsWith('dept-') && !['dept-coredev', 'dept-mobiledev', 'dept-dba'].includes(u.departmentId))
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bank Active Directory / LDAP Girişi" maxWidth="lg">
      <div className="space-y-4">

        {/* Domain Context Banner */}
        <div className="p-3 bg-[#FFFFFF] border border-[#DFE1E6] rounded flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF]">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#172B4D]">Active Directory Domain: {activeDomain}</div>
              <div className="text-[11px] text-[#5E6C84] font-mono">
                LDAPS Host: <span className="text-[#172B4D]">DC01.Expressbank.az:636</span> (Tier-1 Bank PKI)
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-[#FFFFFF] border border-[#DFE1E6] text-[#0052CC] text-[10px] font-mono font-semibold">
            {selectedGroup}
          </span>
        </div>

        {/* Tab switcher */}
        <div className="border-b border-[#DFE1E6] flex gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('LDAP')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'LDAP'
                ? 'border-[#0052CC] text-[#0052CC] font-bold'
                : 'border-transparent text-[#5E6C84] hover:text-[#172B4D]'
            }`}
          >
            LDAP Credentials Sign-In
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('DIRECTORY')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'DIRECTORY'
                ? 'border-[#0052CC] text-[#0052CC] font-bold'
                : 'border-transparent text-[#5E6C84] hover:text-[#172B4D]'
            }`}
          >
            İnformasiya Təhlükəsizliyi DG Directory ({infosecUsers.length})
          </button>
        </div>

        {/* Error / Success Banners */}
        {errorMessage && (
          <div className="p-3 bg-[#FFEBE6] border border-[#FFBDAD] rounded flex items-center gap-2 text-xs text-[#DE350B]">
            <AlertCircle className="w-4 h-4 text-[#DE350B] shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-[#E3FCEF] border border-[#ABF5D1] rounded flex items-center gap-2 text-xs text-[#006644]">
            <CheckCircle2 className="w-4 h-4 text-[#006644] shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {activeTab === 'LDAP' ? (
          <form onSubmit={handleLDAPSubmit} className="space-y-3.5">
            {/* Target Distribution Group */}
            <div>
              <label className="block text-xs font-semibold text-[#172B4D] mb-1">
                Active Directory Distribution & Access Group
              </label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="jira-input"
              >
                <option value="İnformasiya Təhlükəsizliyi DG">İnformasiya Təhlükəsizliyi DG (Default Infosec Group)</option>
                <option value="SOC_Incident_Responders">SOC_Incident_Responders (Tier-2/3)</option>
                <option value="AppSec_Reviewers">AppSec_Reviewers (AST & DevSecOps)</option>
                <option value="IT_Operations_Admins">IT_Operations_Admins (Restricted)</option>
                <option value="Digital_Banking_Engineers">Digital_Banking_Engineers (App Owners)</option>
              </select>
              <div className="text-[10px] text-[#5E6C84] mt-0.5">
                Authentication queries LDAP <span className="font-mono text-[#172B4D]">memberOf</span> attribute for authorization.
              </div>
            </div>

            {/* Username / UPN */}
            <div>
              <label className="block text-xs font-semibold text-[#172B4D] mb-1">
                Domain sAMAccountName / Corporate Email
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="e.g. username or user@expressbank.az"
                  className="jira-input"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-[#172B4D] mb-1">
                Domain Password / Smart Card PIN
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter corporate domain password"
                  className="jira-input pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-[#5E6C84] hover:text-[#172B4D]"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-[#172B4D]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[#DFE1E6] bg-[#FFFFFF] text-[#0052CC] focus:ring-0"
                />
                <span>Yadda saxla (Persist LDAP session token)</span>
              </label>
              <span className="text-[11px] text-[#5E6C84]">Kerberos v5 / NTLMv2</span>
            </div>

            {/* Quick Account Switcher (Dynamically from active users in directory) */}
            {allUsers && allUsers.length > 0 && (
              <div className="pt-2 border-t border-[#DFE1E6] space-y-1.5">
                <div className="text-[10px] text-[#5E6C84] font-semibold uppercase tracking-wider">
                  Available Directory Accounts:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allUsers.slice(0, 6).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setUsernameOrEmail(u.username);
                        switchUser(u.id);
                        onSuccess?.();
                      }}
                      className="px-2 py-1 rounded bg-[#FFFFFF] hover:bg-[#EBECF0] border border-[#DFE1E6] text-[11px] text-[#172B4D] font-mono transition-colors"
                    >
                      {u.fullName} ({u.username})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#DFE1E6]">
              <button
                type="button"
                onClick={onClose}
                className="jira-btn-subtle"
              >
                Bağla (Cancel)
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="jira-btn-primary flex items-center gap-1.5 disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Verifying Bind...' : 'LDAP ilə Daxil Ol (Sign In)'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto custom-scrollbar">
            <div className="text-xs text-[#5E6C84]">
              Active members of <strong className="text-[#172B4D]">İnformasiya Təhlükəsizliyi DG</strong> in Active Directory:
            </div>
            <div className="divide-y divide-[#DFE1E6] text-xs">
              {infosecUsers.map((u) => {
                const isCurrent = currentUser?.id === u.id;
                return (
                  <div
                    key={u.id}
                    className="py-2.5 flex items-center justify-between hover:bg-[#EBECF0] px-2 rounded transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#172B4D]">{u.fullName}</span>
                        <span className="px-1.5 py-0.2 rounded bg-[#FFFFFF] text-[#0052CC] font-mono text-[10px] border border-[#DFE1E6]">
                          {u.sAMAccountName || u.username}
                        </span>
                        {isCurrent && (
                          <span className="jira-lozenge jira-lozenge-done text-[10px]">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#5E6C84]">{u.title} • {u.email}</div>
                      <div className="text-[10px] font-mono text-[#5E6C84] truncate max-w-md">
                        DN: {u.distinguishedName || `CN=${u.fullName},OU=İnformasiya Təhlükəsizliyi,DC=apexbank,DC=az`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleQuickAccountSelect(u);
                        setActiveTab('LDAP');
                      }}
                      className="jira-btn-secondary shrink-0 ml-2"
                    >
                      Select Credentials
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
