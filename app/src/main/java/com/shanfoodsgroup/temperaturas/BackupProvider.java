package com.shanfoodsgroup.temperaturas;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.Objects;

/** Share-only content provider; files are private app cache files. */
public class BackupProvider extends ContentProvider {
    private File getFile(Uri uri) throws FileNotFoundException {
        String filename=uri.getLastPathSegment();
        if(filename==null||!filename.matches("[a-zA-Z0-9_.-]{1,120}"))throw new FileNotFoundException("Invalid name");
        File dir=Objects.requireNonNull(getContext()).getCacheDir();
        File[] files=dir.listFiles((d,n)->n.startsWith("export_")&&n.endsWith("_"+filename));
        if(files==null||files.length==0)throw new FileNotFoundException("Backup no longer available");
        File latest=files[0];for(File f:files)if(f.lastModified()>latest.lastModified())latest=f;
        return latest;
    }
    @Override public boolean onCreate(){return true;}
    @Override public String getType(Uri uri){return uri.toString().endsWith(".csv")?"text/csv":"application/zip";}
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] selectionArgs,String sortOrder){
        String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
        MatrixCursor cursor=new MatrixCursor(columns);
        Object[] values=new Object[columns.length];
        File f;try{f=getFile(uri);}catch(FileNotFoundException e){return cursor;}
        for(int i=0;i<columns.length;i++){
            if(OpenableColumns.DISPLAY_NAME.equals(columns[i]))values[i]=uri.getLastPathSegment();
            if(OpenableColumns.SIZE.equals(columns[i]))values[i]=f.length();
        }
        cursor.addRow(values);return cursor;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
        if(!mode.equals("r"))throw new FileNotFoundException("Read only");
        return ParcelFileDescriptor.open(getFile(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    @Override public int update(Uri uri,ContentValues values,String selection,String[] selectionArgs){return 0;}
    @Override public int delete(Uri uri,String selection,String[] selectionArgs){return 0;}
}
