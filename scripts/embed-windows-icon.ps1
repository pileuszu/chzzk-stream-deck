param([Parameter(Mandatory=$true)][string]$Executable, [Parameter(Mandatory=$true)][string]$Icon)
$ErrorActionPreference = 'Stop'
$exePath = (Resolve-Path -LiteralPath $Executable).Path
$iconPath = (Resolve-Path -LiteralPath $Icon).Path
if ([IO.Path]::GetExtension($exePath) -ne '.exe' -or [IO.Path]::GetExtension($iconPath) -ne '.ico') { throw 'Expected build EXE and ICO paths.' }
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class DeckIconResource {
    delegate bool NameCallback(IntPtr module, IntPtr type, IntPtr name, IntPtr param);
    delegate bool LanguageCallback(IntPtr module, IntPtr type, IntPtr name, ushort language, IntPtr param);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryEx(string file, IntPtr reserved, uint flags);
    [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
    [DllImport("kernel32.dll", EntryPoint="EnumResourceNamesW", SetLastError=true)] static extern bool EnumResourceNames(IntPtr module, IntPtr type, NameCallback callback, IntPtr param);
    [DllImport("kernel32.dll", EntryPoint="EnumResourceLanguagesW", SetLastError=true)] static extern bool EnumResourceLanguages(IntPtr module, IntPtr type, IntPtr name, LanguageCallback callback, IntPtr param);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr BeginUpdateResource(string file, bool delete);
    [DllImport("kernel32.dll", EntryPoint="UpdateResourceW", SetLastError=true)] static extern bool UpdateResource(IntPtr handle, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool EndUpdateResource(IntPtr handle, bool discard);
    public static void Apply(string executable, string icon) {
        byte[] bytes=File.ReadAllBytes(icon);
        if(bytes.Length<6 || BitConverter.ToUInt16(bytes,2)!=1) throw new InvalidDataException("Invalid ICO");
        int count=BitConverter.ToUInt16(bytes,4);
        var groups=new List<Tuple<string,ushort>>();
        IntPtr module=LoadLibraryEx(executable,IntPtr.Zero,2);
        if(module==IntPtr.Zero) throw new Win32Exception();
        try {
            NameCallback names=(m,t,n,p)=>{
                string name=n.ToInt64()<=65535 ? "#"+n.ToInt64() : Marshal.PtrToStringUni(n);
                LanguageCallback langs=(lm,lt,ln,language,lp)=>{groups.Add(Tuple.Create(name,language));return true;};
                EnumResourceLanguages(m,t,n,langs,IntPtr.Zero);
                return true;
            };
            EnumResourceNames(module,new IntPtr(14),names,IntPtr.Zero);
        } finally {FreeLibrary(module);}
        if(groups.Count==0) groups.Add(Tuple.Create("#1",(ushort)0));
        byte[] group=new byte[6+count*14];
        Buffer.BlockCopy(bytes,0,group,0,6);
        IntPtr update=BeginUpdateResource(executable,false);
        if(update==IntPtr.Zero) throw new Win32Exception();
        bool done=false;
        try {
            for(int i=0;i<count;i++){
                int entry=6+i*16;
                int length=BitConverter.ToInt32(bytes,entry+8), offset=BitConverter.ToInt32(bytes,entry+12);
                if(length<=0 || offset<0 || offset>bytes.Length-length) throw new InvalidDataException("Invalid ICO frame");
                byte[] frame=new byte[length];Buffer.BlockCopy(bytes,offset,frame,0,length);
                ushort id=(ushort)(2000+i);
                if(!UpdateResource(update,new IntPtr(3),new IntPtr(id),0,frame,(uint)length)) throw new Win32Exception();
                Buffer.BlockCopy(bytes,entry,group,6+i*14,12);
                Buffer.BlockCopy(BitConverter.GetBytes(id),0,group,6+i*14+12,2);
            }
            foreach(var resource in groups){
                bool numeric=resource.Item1.StartsWith("#");
                IntPtr name=numeric ? new IntPtr(int.Parse(resource.Item1.Substring(1))) : Marshal.StringToHGlobalUni(resource.Item1);
                try {if(!UpdateResource(update,new IntPtr(14),name,resource.Item2,group,(uint)group.Length))throw new Win32Exception();}
                finally{if(!numeric)Marshal.FreeHGlobal(name);}
            }
            if(!EndUpdateResource(update,false))throw new Win32Exception();
            done=true;
        } finally {if(!done)EndUpdateResource(update,true);}
    }
}
'@
[DeckIconResource]::Apply($exePath, $iconPath)
Write-Host 'Embedded the deck icon into the Windows application.'
