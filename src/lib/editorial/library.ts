export const editorialLibraryPageSize=25;

export function editorialLibraryWindow(requestedPage:number,count:number) {
  const pageCount=Math.max(1,Math.ceil(count/editorialLibraryPageSize));
  const page=Math.min(Math.max(1,requestedPage),pageCount);
  return {page,pageCount,from:(page-1)*editorialLibraryPageSize,to:page*editorialLibraryPageSize-1};
}
