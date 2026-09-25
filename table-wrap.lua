-- Wrap tables in a scrollable container so wide tables
-- scroll horizontally on small screens instead of overflowing.
function Table(el)
  return pandoc.Div(el, pandoc.Attr('', {'table-wrap'}))
end
